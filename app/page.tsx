"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db, googleProvider } from "../lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

type Project = {
  id: number;
  name: string;
  author: string;
  university: string;
  date: string;
  description: string;
  products: Product[];
};

type Product = {
  id: number;
  room: string;
  category: string;
  store: string;
  name: string;
  link: string;
  price: number;
  quantity: number;
  image: string;
};

const STORAGE_KEY = "generator-kosztorysow-projects-v2";

const categories = [
  "Meble",
  "Oświetlenie",
  "Płytki",
  "Armatura",
  "AGD",
  "Tekstylia",
  "Dekoracje",
  "Farby",
  "Podłogi",
  "Drzwi",
  "Inne",
];

const emptyProjectForm = {
  name: "",
  author: "",
  university: "",
  date: new Date().toISOString().split("T")[0],
  description: "",
};

const emptyProductForm = {
  room: "",
  category: "",
  store: "",
  name: "",
  link: "",
  price: "",
  quantity: "1",
  image: "",
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<"home" | "projects">("home");

  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");

  const [roomFilter, setRoomFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");

  const activeProject =
    projects.find((project) => project.id === activeProjectId) || null;

  const products = activeProject?.products || [];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!currentUser) {
      setProjects([]);
      setActiveProjectId(null);
      setIsLoaded(true);
      return;
    }

    const user = currentUser;

    async function loadProjectsFromCloud() {
      setIsLoaded(false);

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();

          if (Array.isArray(data.projects)) {
            setProjects(data.projects as Project[]);
          } else {
            setProjects([]);
          }

          if (typeof data.activeProjectId === "number") {
            setActiveProjectId(data.activeProjectId);
          } else {
            setActiveProjectId(null);
          }
        } else {
          const savedData = localStorage.getItem(STORAGE_KEY);

          if (savedData) {
            try {
              const parsedData = JSON.parse(savedData);
              const localProjects = Array.isArray(parsedData.projects)
                ? parsedData.projects
                : [];
              const localActiveProjectId =
                typeof parsedData.activeProjectId === "number"
                  ? parsedData.activeProjectId
                  : null;

              setProjects(localProjects);
              setActiveProjectId(localActiveProjectId);

              await setDoc(userDocRef, {
                email: user.email || "",
                projects: localProjects,
                activeProjectId: localActiveProjectId,
                updatedAt: serverTimestamp(),
              });
            } catch {
              setProjects([]);
              setActiveProjectId(null);
            }
          } else {
            setProjects([]);
            setActiveProjectId(null);
          }
        }
      } catch {
        alert(
          "Nie udało się pobrać projektów z chmury. Sprawdź połączenie internetowe."
        );
      } finally {
        setIsLoaded(true);
      }
    }

    loadProjectsFromCloud();
  }, [currentUser, isAuthReady]);

  useEffect(() => {
    if (!isLoaded || !currentUser) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projects,
        activeProjectId,
      })
    );

    const saveTimeout = window.setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "users", currentUser.uid),
          {
            email: currentUser.email || "",
            projects,
            activeProjectId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        console.error("Nie udało się zapisać projektów w chmurze.");
      }
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [projects, activeProjectId, isLoaded, currentUser]);

  const totalCost = useMemo(() => {
    return products.reduce((sum, product) => {
      return sum + product.price * product.quantity;
    }, 0);
  }, [products]);

  const roomSummary = useMemo(() => {
    const summary: Record<string, number> = {};

    products.forEach((product) => {
      const room = product.room || "Bez pomieszczenia";
      summary[room] = (summary[room] || 0) + product.price * product.quantity;
    });

    return Object.entries(summary);
  }, [products]);

  const categorySummary = useMemo(() => {
    const summary: Record<string, number> = {};

    products.forEach((product) => {
      const category = product.category || "Bez kategorii";
      summary[category] =
        (summary[category] || 0) + product.price * product.quantity;
    });

    return Object.entries(summary);
  }, [products]);

  const uniqueRooms = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => product.room.trim())
          .filter((room) => room.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pl"));
  }, [products]);

  const uniqueStores = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => product.store.trim())
          .filter((store) => store.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pl"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesRoom = !roomFilter || product.room === roomFilter;
      const matchesCategory =
        !categoryFilter || product.category === categoryFilter;
      const matchesStore = !storeFilter || product.store === storeFilter;

      return matchesRoom && matchesCategory && matchesStore;
    });
  }, [products, roomFilter, categoryFilter, storeFilter]);

  function getFriendlyAuthError(error: unknown) {
    const message = String(error);

    if (message.includes("auth/email-already-in-use")) {
      return "Konto z tym adresem e-mail już istnieje.";
    }

    if (message.includes("auth/invalid-email")) {
      return "Podaj poprawny adres e-mail.";
    }

    if (message.includes("auth/weak-password")) {
      return "Hasło jest za krótkie. Użyj minimum 6 znaków.";
    }

    if (
      message.includes("auth/invalid-credential") ||
      message.includes("auth/wrong-password") ||
      message.includes("auth/user-not-found")
    ) {
      return "Nieprawidłowy e-mail lub hasło.";
    }

    if (message.includes("auth/popup-closed-by-user")) {
      return "Okno logowania Google zostało zamknięte.";
    }

    return "Nie udało się zalogować. Spróbuj ponownie.";
  }

  async function handleEmailAuth() {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthMessage("Wpisz e-mail i hasło.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("");

    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      }

      setAuthEmail("");
      setAuthPassword("");
      setShowAuthPassword(false);
    } catch (error) {
      setAuthMessage(getFriendlyAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!authEmail.trim()) {
      setAuthMessage("Wpisz adres e-mail, na który wysłać reset hasła.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("");

    try {
      await sendPasswordResetEmail(auth, authEmail);
      setAuthMessage(
        "Wysłaliśmy link do resetowania hasła. Sprawdź skrzynkę e-mail oraz folder Spam / Oferty / Powiadomienia."
      );
    } catch (error) {
      setAuthMessage(getFriendlyAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setIsAuthLoading(true);
    setAuthMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthMessage(getFriendlyAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setProjects([]);
    setActiveProjectId(null);
    setIsCreatingProject(false);
    setIsProfileMenuOpen(false);
    setCurrentPage("home");
    resetProductForm();
  }

  function goToHomePage() {
    setActiveProjectId(null);
    setIsCreatingProject(false);
    setCurrentPage("home");
    setIsProfileMenuOpen(false);
    resetProductForm();
  }

  function goToMyProjects() {
    setActiveProjectId(null);
    setIsCreatingProject(false);
    setCurrentPage("projects");
    setIsProfileMenuOpen(false);
    resetProductForm();
  }

  function UserNavigation() {
    return (
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#2b0f18] px-6 py-4 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={goToHomePage}
            className="text-left"
          >
            <div className="text-lg font-bold">Generator kosztorysów</div>
            <div className="text-xs text-rose-200">Zestawienia materiałowe</div>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((current) => !current)}
              className="flex items-center gap-3 rounded-xl border border-white/20 px-4 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>

              <span className="text-sm">Mój profil</span>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isProfileMenuOpen ? "rotate-180 transition" : "transition"}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-2xl ring-1 ring-black/5">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Mój profil
                  </p>
                  <p className="mt-1 truncate text-sm font-bold">
                    {currentUser?.email || currentUser?.displayName || "Użytkownik"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={goToHomePage}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold transition hover:bg-zinc-100"
                >
                  <span>Strona główna</span>
                  <span>→</span>
                </button>

                <button
                  type="button"
                  onClick={goToMyProjects}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold transition hover:bg-zinc-100"
                >
                  <span>Moje projekty</span>
                  <span>→</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <span>Wyloguj</span>
                  <span>⎋</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    );
  }

  function formatCurrency(value: number) {
    return value.toLocaleString("pl-PL", {
      style: "currency",
      currency: "PLN",
    });
  }

  function safeFileName(name: string) {
    return name
      .toLowerCase()
      .replaceAll(" ", "-")
      .replaceAll("ą", "a")
      .replaceAll("ć", "c")
      .replaceAll("ę", "e")
      .replaceAll("ł", "l")
      .replaceAll("ń", "n")
      .replaceAll("ó", "o")
      .replaceAll("ś", "s")
      .replaceAll("ż", "z")
      .replaceAll("ź", "z")
      .replace(/[^a-z0-9-]/g, "");
  }

  function escapeHtml(text: string) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function detectStoreFromLink(link: string) {
    const lowerLink = link.toLowerCase();

    if (lowerLink.includes("ikea.")) return "IKEA";
    if (lowerLink.includes("castorama.")) return "Castorama";
    if (lowerLink.includes("leroymerlin.")) return "Leroy Merlin";
    if (lowerLink.includes("agatameble.")) return "Agata Meble";
    if (lowerLink.includes("komfort.")) return "Komfort";
    if (lowerLink.includes("brw.")) return "Black Red White";
    if (lowerLink.includes("obi.")) return "OBI";
    if (lowerLink.includes("jysk.")) return "JYSK";
    if (lowerLink.includes("home-you.")) return "home&you";
    if (lowerLink.includes("allegro.")) return "Allegro";
    if (lowerLink.includes("amazon.")) return "Amazon";
    if (lowerLink.includes("westwing.")) return "Westwing";

    return "";
  }

  function handleProductLinkChange(link: string) {
    const detectedStore = detectStoreFromLink(link);

    setProductForm((currentForm) => ({
      ...currentForm,
      link,
      store: detectedStore || currentForm.store,
    }));
  }

  function clearProductLink() {
    setProductForm((currentForm) => ({
      ...currentForm,
      link: "",
      store: "",
    }));

    setFetchMessage("");
  }

  async function fetchProductDataFromLink() {
    if (!productForm.link.trim()) {
      setFetchMessage("Najpierw wklej link do produktu.");
      return;
    }

    setIsFetchingProduct(true);
    setFetchMessage("");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: productForm.link,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFetchMessage(
          data.error ||
            "Nie udało się pobrać danych. Uzupełnij produkt ręcznie."
        );
        return;
      }

      setProductForm((currentForm) => ({
        ...currentForm,
        store: data.store || currentForm.store,
        category: data.category || currentForm.category,
        name: data.name || currentForm.name,
        price: data.price || currentForm.price,
        image: data.image || currentForm.image,
      }));

      const missingFields = [];

      if (!data.name) missingFields.push("nazwy");
      if (!data.price) missingFields.push("ceny");
      if (!data.image) missingFields.push("zdjęcia");

      if (missingFields.length === 0) {
        setFetchMessage("Dane zostały pobrane.");
      } else {
        setFetchMessage(
          `Pobrano część danych. Sprawdź ręcznie: ${missingFields.join(", ")}.`
        );
      }
    } catch {
      setFetchMessage(
        "Ten sklep może blokować automatyczne pobieranie danych. Uzupełnij pola ręcznie albo spróbuj innego linku."
      );
    } finally {
      setIsFetchingProduct(false);
    }
  }

  function startNewProject() {
    setProjectForm({
      name: "",
      author: "",
      university: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
    });
    setIsCreatingProject(true);
    setActiveProjectId(null);
    resetProductForm();
  }

  function createProject() {
    if (!projectForm.name.trim()) {
      alert("Podaj nazwę projektu.");
      return;
    }

    const newProject: Project = {
      id: Date.now(),
      name: projectForm.name,
      author: projectForm.author,
      university: projectForm.university,
      date: projectForm.date,
      description: projectForm.description,
      products: [],
    };

    setProjects((currentProjects) => [...currentProjects, newProject]);
    setActiveProjectId(newProject.id);
    setIsCreatingProject(false);
  }

  function updateProject() {
    if (!activeProject) return;

    if (!projectForm.name.trim()) {
      alert("Podaj nazwę projektu.");
      return;
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === activeProject.id
          ? {
              ...project,
              name: projectForm.name,
              author: projectForm.author,
              university: projectForm.university,
              date: projectForm.date,
              description: projectForm.description,
            }
          : project
      )
    );

    setActiveProjectId(activeProject.id);
    setIsCreatingProject(false);
  }

  function openProject(projectId: number) {
    setActiveProjectId(projectId);
    setIsCreatingProject(false);
    resetProductForm();
  }

  function backToProjects() {
    setActiveProjectId(null);
    setIsCreatingProject(false);
    resetProductForm();
  }

  function editProjectData() {
    if (!activeProject) return;

    setProjectForm({
      name: activeProject.name,
      author: activeProject.author,
      university: activeProject.university,
      date: activeProject.date,
      description: activeProject.description,
    });

    setIsCreatingProject(true);
  }

  function deleteProject(projectId: number) {
    const projectToDelete = projects.find((project) => project.id === projectId);

    const confirmed = confirm(
      `Czy na pewno chcesz usunąć projekt "${
        projectToDelete?.name || ""
      }" i wszystkie jego produkty?`
    );

    if (!confirmed) return;

    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId)
    );

    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  }

  function clearProductFilters() {
    setRoomFilter("");
    setCategoryFilter("");
    setStoreFilter("");
  }

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId(null);
    setIsFetchingProduct(false);
    setFetchMessage("");
  }

  function saveProduct() {
    if (!activeProject) return;

    if (!productForm.name.trim()) {
      alert("Podaj nazwę produktu.");
      return;
    }

    const price = Number(productForm.price);
    const quantity = Number(productForm.quantity);

    if (Number.isNaN(price) || price < 0) {
      alert("Podaj poprawną cenę.");
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      alert("Podaj poprawną ilość.");
      return;
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== activeProject.id) return project;

        if (editingProductId) {
          return {
            ...project,
            products: project.products.map((product) =>
              product.id === editingProductId
                ? {
                    ...product,
                    room: productForm.room,
                    category: productForm.category,
                    store: productForm.store,
                    name: productForm.name,
                    link: productForm.link,
                    price,
                    quantity,
                    image: productForm.image,
                  }
                : product
            ),
          };
        }

        const newProduct: Product = {
          id: Date.now(),
          room: productForm.room,
          category: productForm.category,
          store: productForm.store,
          name: productForm.name,
          link: productForm.link,
          price,
          quantity,
          image: productForm.image,
        };

        return {
          ...project,
          products: [...project.products, newProduct],
        };
      })
    );

    resetProductForm();
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);

    setProductForm({
      room: product.room || "",
      category: product.category || "",
      store: product.store || "",
      name: product.name,
      link: product.link,
      price: String(product.price),
      quantity: String(product.quantity),
      image: product.image,
    });
  }

  function deleteProduct(id: number) {
    if (!activeProject) return;

    const confirmed = confirm("Czy na pewno chcesz usunąć ten produkt?");
    if (!confirmed) return;

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === activeProject.id
          ? {
              ...project,
              products: project.products.filter((product) => product.id !== id),
            }
          : project
      )
    );
  }

  function exportToExcel() {
    if (!activeProject) return;

    if (products.length === 0) {
      alert("Dodaj przynajmniej jeden produkt przed eksportem.");
      return;
    }

    const productRows = products.map((product, index) => ({
      Lp: index + 1,
      Pomieszczenie: product.room || "-",
      Kategoria: product.category || "-",
      Sklep: product.store || "-",
      Produkt: product.name,
      Cena: product.price,
      Ilość: product.quantity,
      Wartość: product.price * product.quantity,
      Link: product.link,
      "Link do zdjęcia": product.image,
    }));

    const roomRows = roomSummary.map(([room, sum]) => ({
      Pomieszczenie: room,
      Suma: sum,
    }));

    const categoryRows = categorySummary.map(([category, sum]) => ({
      Kategoria: category,
      Suma: sum,
    }));

    const projectRows = [
      ["Nazwa projektu", activeProject.name],
      ["Autor", activeProject.author],
      ["Uczelnia / pracownia", activeProject.university],
      ["Data", activeProject.date],
      ["Opis", activeProject.description],
      ["Suma projektu", totalCost],
    ];

    const workbook = XLSX.utils.book_new();

    const projectSheet = XLSX.utils.aoa_to_sheet(projectRows);
    const productSheet = XLSX.utils.json_to_sheet(productRows);
    const roomSheet = XLSX.utils.json_to_sheet(roomRows);
    const categorySheet = XLSX.utils.json_to_sheet(categoryRows);

    XLSX.utils.book_append_sheet(workbook, projectSheet, "Projekt");
    XLSX.utils.book_append_sheet(workbook, productSheet, "Produkty");
    XLSX.utils.book_append_sheet(workbook, roomSheet, "Pomieszczenia");
    XLSX.utils.book_append_sheet(workbook, categorySheet, "Kategorie");

    XLSX.writeFile(
      workbook,
      `${safeFileName(activeProject.name)}-zestawienie-materialowe.xlsx`
    );
  }

  function exportToPDF() {
    if (!activeProject) return;

    if (products.length === 0) {
      alert("Dodaj przynajmniej jeden produkt przed eksportem.");
      return;
    }

    const groupedProducts = products.reduce<Record<string, Product[]>>(
      (groups, product) => {
        const room = product.room || "Bez pomieszczenia";

        if (!groups[room]) {
          groups[room] = [];
        }

        groups[room].push(product);

        return groups;
      },
      {}
    );

    const groupedProductsHtml = Object.entries(groupedProducts)
      .map(([room, roomProducts]) => {
        const roomTotal = roomProducts.reduce((sum, product) => {
          return sum + product.price * product.quantity;
        }, 0);

        const rowsHtml = roomProducts
          .map((product, index) => {
            return `
              <tr>
                <td class="center">${index + 1}</td>
                <td class="image-cell">
                  ${
                    product.image
                      ? `<img src="${escapeHtml(
                          product.image
                        )}" alt="${escapeHtml(product.name)}" />`
                      : `<span class="no-image">Brak zdjęcia</span>`
                  }
                </td>
                <td>
                  <strong>${escapeHtml(product.name)}</strong>
                  ${
                    product.link
                      ? `<div class="small-link">${escapeHtml(
                          product.link
                        )}</div>`
                      : ""
                  }
                </td>
                <td>${escapeHtml(product.category || "-")}</td>
                <td>${escapeHtml(product.store || "-")}</td>
                <td class="right">${formatCurrency(product.price)}</td>
                <td class="center">${product.quantity}</td>
                <td class="right strong">${formatCurrency(
                  product.price * product.quantity
                )}</td>
              </tr>
            `;
          })
          .join("");

        return `
          <section class="room-section">
            <div class="room-header">
              <h3>${escapeHtml(room)}</h3>
              <div>${formatCurrency(roomTotal)}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Lp.</th>
                  <th>Zdjęcie</th>
                  <th>Produkt</th>
                  <th>Kategoria</th>
                  <th>Sklep</th>
                  <th>Cena</th>
                  <th>Ilość</th>
                  <th>Wartość</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const roomRowsHtml = roomSummary
      .map(([room, sum]) => {
        return `
          <tr>
            <td>${escapeHtml(room)}</td>
            <td class="right strong">${formatCurrency(sum)}</td>
          </tr>
        `;
      })
      .join("");

    const categoryRowsHtml = categorySummary
      .map(([category, sum]) => {
        return `
          <tr>
            <td>${escapeHtml(category)}</td>
            <td class="right strong">${formatCurrency(sum)}</td>
          </tr>
        `;
      })
      .join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Przeglądarka zablokowała nowe okno. Zezwól na wyskakujące okna.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pl">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(activeProject.name)} - zestawienie materiałowe</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #18181b;
              font-family: Arial, Helvetica, sans-serif;
            }

            .page {
              padding: 36px;
            }

            .cover {
              border-bottom: 4px solid #27272a;
              padding-bottom: 28px;
              margin-bottom: 28px;
            }

            .label {
              color: #27272a;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              margin-bottom: 12px;
            }

            h1 {
              margin: 0;
              font-size: 34px;
              line-height: 1.15;
              color: #111827;
            }

            .subtitle {
              margin-top: 10px;
              color: #4b5563;
              font-size: 14px;
            }

            .project-card {
              margin-top: 24px;
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              padding: 18px;
              background: #f9fafb;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px 24px;
              font-size: 13px;
            }

            .project-card strong {
              color: #111827;
            }

            .project-description {
              grid-column: 1 / -1;
              line-height: 1.5;
            }

            .summary-strip {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 12px;
              margin: 24px 0;
            }

            .summary-box {
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 16px;
              background: white;
            }

            .summary-box .name {
              font-size: 11px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              font-weight: 700;
            }

            .summary-box .value {
              margin-top: 8px;
              font-size: 22px;
              font-weight: 800;
              color: #111827;
            }

            h2 {
              margin: 34px 0 14px;
              color: #111827;
              font-size: 22px;
            }

            h3 {
              margin: 0;
              color: #111827;
              font-size: 17px;
            }

            .two-columns {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 12px;
            }

            .room-section {
              margin-top: 26px;
              page-break-inside: avoid;
            }

            .room-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-radius: 14px 14px 0 0;
              background: #f3f4f6;
              color: #111827;
              padding: 12px 14px;
            }

            .room-header h3 {
              color: #111827;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10.5px;
            }

            th {
              background: #f3f4f6;
              color: #111827;
              text-align: left;
              padding: 8px;
              border: 1px solid #e5e7eb;
              font-size: 10px;
            }

            td {
              padding: 8px;
              border: 1px solid #e5e7eb;
              vertical-align: middle;
              word-break: break-word;
            }

            tr:nth-child(even) td {
              background: #f9fafb;
            }

            .image-cell {
              width: 70px;
              text-align: center;
            }

            .image-cell img {
              width: 52px;
              height: 52px;
              object-fit: cover;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
            }

            .no-image {
              display: inline-block;
              width: 52px;
              color: #a1a1aa;
              font-size: 9px;
              line-height: 1.2;
            }

            .small-link {
              margin-top: 4px;
              color: #6b7280;
              font-size: 8.5px;
              line-height: 1.25;
            }

            .right {
              text-align: right;
              white-space: nowrap;
            }

            .center {
              text-align: center;
            }

            .strong {
              font-weight: 800;
            }

            .footer {
              margin-top: 34px;
              padding-top: 14px;
              border-top: 1px solid #e5e7eb;
              color: #6b7280;
              font-size: 10px;
              display: flex;
              justify-content: space-between;
              gap: 16px;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .page {
                padding: 12mm;
              }

              .room-section {
                page-break-inside: avoid;
              }

              tr {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>

        <body>
          <main class="page">
            <section class="cover">
              <div class="label">Zestawienie materiałowe</div>

              <h1>${escapeHtml(activeProject.name)}</h1>

              <div class="project-card">
                <div>
                  <strong>Autor:</strong>
                  ${escapeHtml(activeProject.author || "-")}
                </div>

                <div>
                  <strong>Data:</strong>
                  ${escapeHtml(activeProject.date)}
                </div>

                <div>
                  <strong>Uczelnia / pracownia:</strong>
                  ${escapeHtml(activeProject.university || "-")}
                </div>

                <div>
                  <strong>Liczba produktów:</strong>
                  ${products.length}
                </div>

                ${
                  activeProject.description
                    ? `<div class="project-description">
                        <strong>Opis projektu:</strong>
                        ${escapeHtml(activeProject.description)}
                      </div>`
                    : ""
                }
              </div>
            </section>

            <section class="summary-strip">
              <div class="summary-box">
                <div class="name">Suma projektu</div>
                <div class="value">${formatCurrency(totalCost)}</div>
              </div>

              <div class="summary-box">
                <div class="name">Produkty</div>
                <div class="value">${products.length}</div>
              </div>

              <div class="summary-box">
                <div class="name">Pomieszczenia</div>
                <div class="value">${roomSummary.length}</div>
              </div>
            </section>

            <section class="two-columns">
              <div>
                <h2>Podsumowanie pomieszczeń</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Pomieszczenie</th>
                      <th>Suma</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${roomRowsHtml}
                  </tbody>
                </table>
              </div>

              <div>
                <h2>Podsumowanie kategorii</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Kategoria</th>
                      <th>Suma</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${categoryRowsHtml}
                  </tbody>
                </table>
              </div>
            </section>

            <h2>Produkty według pomieszczeń</h2>

            ${groupedProductsHtml}

            <div class="footer">
              <div>Wygenerowano w Generatorze kosztorysów i zestawień materiałowych.</div>
              <div>${escapeHtml(new Date().toLocaleDateString("pl-PL"))}</div>
            </div>
          </main>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  if (!isLoaded || !isAuthReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#2b0f18] text-white">
        <p>Ładowanie aplikacji...</p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#2b0f18] px-6 py-10 text-white">
        <section className="w-full max-w-md rounded-3xl bg-white p-7 text-zinc-900 shadow-2xl">
          <div className="mb-7 text-center">
            <p className="mb-3 text-sm uppercase tracking-[0.28em] text-[#7a1f3d]">
              Generator kosztorysów
            </p>

            <h1 className="text-3xl font-bold">
              {authMode === "login" ? "Logowanie" : "Rejestracja"}
            </h1>

            <p className="mt-3 text-sm text-zinc-500">
              Zaloguj się, aby korzystać z generatora kosztorysów.
            </p>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="font-medium">E-mail</span>
              <input
                type="email"
                className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                placeholder="adres@email.com"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="font-medium">Hasło</span>

              <div className="relative">
                <input
                  type={showAuthPassword ? "text" : "password"}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 pr-12 outline-none focus:border-[#7a1f3d]"
                  placeholder="minimum 6 znaków"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowAuthPassword((currentValue) => !currentValue)
                  }
                  className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-[#7a1f3d]"
                  aria-label={
                    showAuthPassword ? "Ukryj hasło" : "Pokaż hasło"
                  }
                  title={showAuthPassword ? "Ukryj hasło" : "Pokaż hasło"}
                >
                  {showAuthPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m2 2 20 20" />
                      <path d="M6.71 6.71C3.95 8.35 2 12 2 12s3.5 7 10 7c1.55 0 2.93-.4 4.12-1.02" />
                      <path d="M10.73 5.08C11.14 5.03 11.56 5 12 5c6.5 0 10 7 10 7a16.26 16.26 0 0 1-2.19 3.23" />
                      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
                      <path d="M14.12 9.88A3 3 0 0 0 9.88 14.12" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {authMode === "login" && (
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isAuthLoading}
                className="text-left text-sm font-semibold text-[#7a1f3d] underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                Nie pamiętasz hasła?
              </button>
            )}

            {authMode === "login" && (
              <p className="text-xs leading-relaxed text-slate-500">
                Link resetujący hasło zostanie wysłany na adres wpisany w polu e-mail.
                Jeśli wiadomość nie przyjdzie od razu, sprawdź folder Spam.
              </p>
            )}

            {authMessage && (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-[#7a1f3d]">
                {authMessage}
              </p>
            )}

            <button
              onClick={handleEmailAuth}
              disabled={isAuthLoading}
              className="rounded-xl bg-[#7a1f3d] px-6 py-4 font-bold text-white transition hover:bg-[#5d172e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAuthLoading
                ? "Proszę czekać..."
                : authMode === "login"
                ? "Zaloguj się"
                : "Utwórz konto"}
            </button>

            <button
              onClick={handleGoogleLogin}
              disabled={isAuthLoading}
              className="rounded-xl border border-zinc-300 px-6 py-4 font-bold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Zaloguj przez Google
            </button>

            <button
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthMessage("");
              }}
              className="text-sm font-semibold text-[#7a1f3d] underline"
            >
              {authMode === "login"
                ? "Nie masz konta? Zarejestruj się"
                : "Masz już konto? Zaloguj się"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (isCreatingProject) {
    const isEditingExistingProject = Boolean(activeProject);

    return (
      <main className="min-h-screen bg-[#2b0f18] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-sm uppercase tracking-[0.35em] text-rose-200">
              Generator kosztorysów
            </p>

            <h1 className="text-4xl font-bold md:text-6xl">
              {isEditingExistingProject
                ? "Edytuj dane projektu"
                : "Nowy projekt"}
            </h1>

            <p className="mt-5 text-lg text-rose-100">
              Najpierw utwórz projekt, a potem dodaj produkty i materiały.
            </p>
          </div>

          <section className="rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl">
            <h2 className="mb-6 text-2xl font-bold">Dane projektu</h2>

            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-medium">Nazwa projektu</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="np. Mieszkanie ul. Bracka – Zaliczenie"
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2">
                <span className="font-medium">Autor</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="Imię i nazwisko"
                  value={projectForm.author}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      author: event.target.value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2">
                <span className="font-medium">Uczelnia / pracownia</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="np. Akademia Sztuki / Pracownia projektowa"
                  value={projectForm.university}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      university: event.target.value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2">
                <span className="font-medium">Data</span>
                <input
                  type="date"
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  value={projectForm.date}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      date: event.target.value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2">
                <span className="font-medium">Opis projektu</span>
                <textarea
                  className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="Krótki opis projektu..."
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      description: event.target.value,
                    })
                  }
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={
                    isEditingExistingProject ? updateProject : createProject
                  }
                  className="rounded-xl bg-[#7a1f3d] px-6 py-4 font-bold text-white transition hover:bg-[#5d172e]"
                >
                  {isEditingExistingProject
                    ? "Zapisz dane projektu"
                    : "Utwórz projekt"}
                </button>

                <button
                  onClick={backToProjects}
                  className="rounded-xl border border-zinc-300 px-6 py-4 font-bold text-zinc-900 transition hover:bg-zinc-100"
                >
                  Wróć do listy projektów
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!activeProject && currentPage === "home") {
    return (
      <>
        <UserNavigation />

        <main className="min-h-screen bg-[#2b0f18] px-6 py-12 text-white">
          <div className="mx-auto max-w-7xl">
            <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <p className="mb-4 text-sm uppercase tracking-[0.35em] text-rose-200">
                  Generator kosztorysów
                </p>

                <h1 className="max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
                  Twórz estetyczne zestawienia materiałowe do projektów wnętrz.
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-rose-100">
                  Aplikacja pomaga zebrać produkty z różnych sklepów, policzyć
                  koszty projektu, uporządkować materiały według pomieszczeń i
                  wygenerować gotowy plik PDF albo Excel.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={goToMyProjects}
                    className="rounded-xl bg-white px-6 py-4 font-bold text-[#2b0f18] transition hover:bg-rose-100"
                  >
                    Przejdź do moich projektów
                  </button>

                  <button
                    type="button"
                    onClick={startNewProject}
                    className="rounded-xl border border-white/30 px-6 py-4 font-bold text-white transition hover:bg-white/10"
                  >
                    Utwórz nowy projekt
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl">
                <h2 className="text-2xl font-bold">Jak to działa?</h2>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl bg-zinc-100 p-5">
                    <p className="text-sm font-bold text-[#7a1f3d]">Krok 1</p>
                    <h3 className="mt-1 text-lg font-bold">
                      Utwórz projekt
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      Podaj nazwę projektu, autora, datę i krótki opis.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-zinc-100 p-5">
                    <p className="text-sm font-bold text-[#7a1f3d]">Krok 2</p>
                    <h3 className="mt-1 text-lg font-bold">
                      Dodaj produkty
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      Wklej link do produktu albo uzupełnij dane ręcznie:
                      nazwę, cenę, ilość, sklep, kategorię i pomieszczenie.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-zinc-100 p-5">
                    <p className="text-sm font-bold text-[#7a1f3d]">Krok 3</p>
                    <h3 className="mt-1 text-lg font-bold">
                      Wygeneruj zestawienie
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      Pobierz profesjonalne zestawienie w PDF albo plik Excel
                      do dalszej pracy.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10 grid gap-5 md:grid-cols-3">
              <div className="rounded-3xl bg-white/10 p-6">
                <h3 className="text-xl font-bold">Porządek w projekcie</h3>
                <p className="mt-3 text-sm leading-relaxed text-rose-100">
                  Produkty są podzielone według pomieszczeń, kategorii i sklepów.
                </p>
              </div>

              <div className="rounded-3xl bg-white/10 p-6">
                <h3 className="text-xl font-bold">Kontrola kosztów</h3>
                <p className="mt-3 text-sm leading-relaxed text-rose-100">
                  Aplikacja automatycznie liczy sumę projektu i częściowe
                  podsumowania.
                </p>
              </div>

              <div className="rounded-3xl bg-white/10 p-6">
                <h3 className="text-xl font-bold">Eksport PDF i Excel</h3>
                <p className="mt-3 text-sm leading-relaxed text-rose-100">
                  Gotowe zestawienie możesz zapisać i wysłać dalej.
                </p>
              </div>
            </section>
          </div>
        </main>
      </>
    );
  }

  if (!activeProject) {
    return (
      <>
        <UserNavigation />

        <main className="min-h-screen bg-[#2b0f18] px-6 py-10 text-white">
          <div className="mx-auto max-w-6xl">
          <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.35em] text-rose-200">
                Generator kosztorysów
              </p>

              <h1 className="text-4xl font-bold md:text-6xl">
                Twoje projekty
              </h1>

              <p className="mt-5 max-w-2xl text-lg text-rose-100">
                Wybierz projekt, utwórz nowy kosztorys albo wróć do wcześniej
                zapisanego zestawienia materiałowego.
              </p>
            </div>

            <button
              onClick={startNewProject}
              className="rounded-xl bg-white px-6 py-4 font-bold text-[#2b0f18] transition hover:bg-rose-100"
            >
              + Nowy projekt
            </button>
          </header>

          {projects.length === 0 ? (
            <section className="rounded-3xl bg-white p-8 text-center text-zinc-900 shadow-2xl">
              <h2 className="text-2xl font-bold">Brak projektów</h2>
              <p className="mt-3 text-zinc-500">
                Utwórz pierwszy projekt, np. „Mieszkanie ul. Bracka –
                Zaliczenie”.
              </p>

              <button
                onClick={startNewProject}
                className="mt-6 rounded-xl bg-[#7a1f3d] px-6 py-4 font-bold text-white transition hover:bg-[#5d172e]"
              >
                Utwórz pierwszy projekt
              </button>
            </section>
          ) : (
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const projectTotal = project.products.reduce(
                  (sum, product) => sum + product.price * product.quantity,
                  0
                );

                return (
                  <article
                    key={project.id}
                    className="rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl"
                  >
                    <p className="text-sm text-zinc-500">{project.date}</p>

                    <h2 className="mt-2 text-2xl font-bold">
                      {project.name}
                    </h2>

                    <p className="mt-2 text-sm text-zinc-500">
                      {project.author || "Brak autora"} ·{" "}
                      {project.university || "Brak uczelni/pracowni"}
                    </p>

                    {project.description && (
                      <p className="mt-4 line-clamp-3 text-sm text-zinc-600">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <p className="text-xs text-zinc-500">Produkty</p>
                        <p className="mt-1 text-2xl font-bold">
                          {project.products.length}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-zinc-100 p-4">
                        <p className="text-xs text-zinc-500">Suma</p>
                        <p className="mt-1 text-lg font-bold">
                          {formatCurrency(projectTotal)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-2">
                      <button
                        onClick={() => openProject(project.id)}
                        className="flex-1 rounded-xl bg-[#7a1f3d] px-4 py-3 font-bold text-white transition hover:bg-[#5d172e]"
                      >
                        Otwórz
                      </button>

                      <button
                        onClick={() => deleteProject(project.id)}
                        title="Usuń projekt"
                        aria-label="Usuń projekt"
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="19"
                          height="19"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <UserNavigation />

      <main className="min-h-screen bg-[#f7f1f3] px-6 py-8 text-zinc-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl bg-[#2b0f18] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <button
                onClick={backToProjects}
                className="mb-4 rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                ← Lista projektów
              </button>

              <p className="text-sm uppercase tracking-[0.3em] text-rose-200">
                Aktywny projekt
              </p>

              <h1 className="mt-2 text-3xl font-bold">{activeProject.name}</h1>

              <p className="mt-2 text-rose-100">
                {activeProject.author || "Brak autora"} ·{" "}
                {activeProject.university || "Brak uczelni/pracowni"} ·{" "}
                {activeProject.date}
              </p>

              {activeProject.description && (
                <p className="mt-3 max-w-3xl text-rose-100">
                  {activeProject.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={editProjectData}
                className="rounded-xl border border-white/30 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Edytuj dane projektu
              </button>

              <button
                onClick={() => deleteProject(activeProject.id)}
                className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700"
              >
                Usuń projekt
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-2xl font-bold">
              {editingProductId ? "Edytuj produkt" : "Dodaj produkt"}
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-zinc-500">
              Wklej link do produktu, pobierz dane automatycznie albo uzupełnij
              formularz ręcznie. Dane możesz później edytować w tabeli.
            </p>

            <div className="grid gap-6">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Link produktu
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Wklej adres produktu ze sklepu i spróbuj pobrać dane
                    automatycznie.
                  </p>
                </div>

                <label className="grid gap-2">
                  <span className="font-medium">Link do produktu</span>

                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-[#7a1f3d]"
                      placeholder="https://..."
                      value={productForm.link}
                      onChange={(event) =>
                        handleProductLinkChange(event.target.value)
                      }
                    />

                    <button
                      type="button"
                      onClick={clearProductLink}
                      disabled={!productForm.link}
                      title="Usuń link"
                      aria-label="Usuń link"
                      className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={fetchProductDataFromLink}
                  disabled={isFetchingProduct}
                  className="mt-3 w-full rounded-xl border border-[#7a1f3d] bg-white px-5 py-3 font-bold text-[#7a1f3d] transition hover:bg-[#7a1f3d] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFetchingProduct
                    ? "Pobieranie danych..."
                    : "Pobierz dane z linku"}
                </button>

                {fetchMessage && (
                  <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#7a1f3d]">
                    {fetchMessage}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Dane produktu
                </h3>

                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="font-medium">Kategoria</span>
                  <select
                    className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                    value={productForm.category}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        category: event.target.value,
                      })
                    }
                  >
                    <option value="">Wybierz kategorię</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="font-medium">Sklep</span>
                  <input
                    className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                    placeholder="np. IKEA"
                    value={productForm.store}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        store: event.target.value,
                      })
                    }
                  />
                  </label>
                </div>

                <label className="mt-4 grid gap-2">
                  <span className="font-medium">Nazwa produktu</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="np. Sofa 3-osobowa"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2">
                <span className="font-medium">Pomieszczenie</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="np. Salon"
                  value={productForm.room}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      room: event.target.value,
                    })
                  }
                />
              </label>

              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Cena i ilość
                </h3>

                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="font-medium">Cena</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                    placeholder="0.00"
                    value={productForm.price}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        price: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="grid gap-2">
                  <span className="font-medium">Ilość</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                    value={productForm.quantity}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        quantity: event.target.value,
                      })
                    }
                  />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Zdjęcie
                </h3>

                <label className="grid gap-2">
                  <span className="font-medium">Link do zdjęcia</span>
                <input
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#7a1f3d]"
                  placeholder="https://..."
                  value={productForm.image}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      image: event.target.value,
                    })
                  }
                  />
                </label>
              </div>

              <button
                onClick={saveProduct}
                className="rounded-xl bg-[#7a1f3d] px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-[#5d172e]"
              >
                {editingProductId ? "Zapisz zmiany" : "Dodaj do zestawienia"}
              </button>

              {editingProductId && (
                <button
                  onClick={resetProductForm}
                  className="rounded-xl border border-zinc-300 px-6 py-3 font-semibold transition hover:bg-zinc-100"
                >
                  Anuluj edycję
                </button>
              )}
            </div>
          </section>

          <section className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <p className="text-sm text-zinc-500">Liczba produktów</p>
                <p className="mt-2 text-3xl font-bold">{products.length}</p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <p className="text-sm text-zinc-500">Suma projektu</p>
                <p className="mt-2 text-3xl font-bold">
                  {formatCurrency(totalCost)}
                </p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <p className="text-sm text-zinc-500">Eksport</p>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={exportToPDF}
                    className="rounded-xl bg-[#7a1f3d] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#5d172e]"
                  >
                    PDF
                  </button>

                  <button
                    onClick={exportToExcel}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                  >
                    Excel
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <h2 className="mb-4 text-2xl font-bold">
                  Podsumowanie pomieszczeń
                </h2>

                {roomSummary.length === 0 ? (
                  <p className="text-zinc-500">
                    Dodaj pierwszy produkt, aby zobaczyć podsumowanie.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {roomSummary.map(([room, sum]) => (
                      <div
                        key={room}
                        className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-3"
                      >
                        <span className="font-medium">{room}</span>
                        <span className="font-bold">{formatCurrency(sum)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <h2 className="mb-4 text-2xl font-bold">
                  Podsumowanie kategorii
                </h2>

                {categorySummary.length === 0 ? (
                  <p className="text-zinc-500">
                    Dodaj pierwszy produkt, aby zobaczyć podsumowanie.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {categorySummary.map(([category, sum]) => (
                      <div
                        key={category}
                        className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-3"
                      >
                        <span className="font-medium">{category}</span>
                        <span className="font-bold">{formatCurrency(sum)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
              <div className="border-b border-zinc-200 p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">
                      Zestawienie materiałowe
                    </h2>

                    <p className="mt-2 text-sm text-zinc-500">
                      Widoczne produkty: {filteredProducts.length} z{" "}
                      {products.length}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-zinc-500">
                        Pomieszczenie
                      </span>

                      <select
                        className="rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#7a1f3d]"
                        value={roomFilter}
                        onChange={(event) => setRoomFilter(event.target.value)}
                      >
                        <option value="">Wszystkie</option>
                        {uniqueRooms.map((room) => (
                          <option key={room} value={room}>
                            {room}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-zinc-500">
                        Kategoria
                      </span>

                      <select
                        className="rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#7a1f3d]"
                        value={categoryFilter}
                        onChange={(event) =>
                          setCategoryFilter(event.target.value)
                        }
                      >
                        <option value="">Wszystkie</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-zinc-500">
                        Sklep
                      </span>

                      <select
                        className="rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#7a1f3d]"
                        value={storeFilter}
                        onChange={(event) => setStoreFilter(event.target.value)}
                      >
                        <option value="">Wszystkie</option>
                        {uniqueStores.map((store) => (
                          <option key={store} value={store}>
                            {store}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={clearProductFilters}
                      className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100"
                    >
                      Wyczyść filtry
                    </button>
                  </div>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="p-6 text-zinc-500">
                  {products.length === 0
                    ? "Brak produktów. Dodaj pierwszy produkt z formularza po lewej stronie."
                    : "Brak produktów pasujących do wybranych filtrów."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] border-collapse text-left">
                    <thead className="bg-zinc-100 text-sm">
                      <tr>
                        <th className="p-4">Zdjęcie</th>
                        <th className="p-4">Produkt</th>
                        <th className="p-4">Kategoria</th>
                        <th className="p-4">Sklep</th>
                        <th className="p-4">Pomieszczenie</th>
                        <th className="p-4">Cena</th>
                        <th className="p-4">Ilość</th>
                        <th className="p-4">Wartość</th>
                        <th className="p-4">Akcje</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredProducts.map((product) => (
                        <tr
                          key={product.id}
                          className="border-t border-zinc-200"
                        >
                          <td className="p-4">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="h-16 w-16 rounded-xl object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-100 text-xs text-zinc-400">
                                Brak
                              </div>
                            )}
                          </td>

                          <td className="p-4">
                            <div className="font-bold">{product.name}</div>

                            {product.link && (
                              <a
                                href={product.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-[#7a1f3d] underline"
                              >
                                Otwórz link
                              </a>
                            )}
                          </td>

                          <td className="p-4">{product.category || "-"}</td>
                          <td className="p-4">{product.store || "-"}</td>
                          <td className="p-4">{product.room || "-"}</td>

                          <td className="p-4">
                            {formatCurrency(product.price)}
                          </td>

                          <td className="p-4">{product.quantity}</td>

                          <td className="p-4 font-bold">
                            {formatCurrency(product.price * product.quantity)}
                          </td>

                          <td className="p-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => editProduct(product)}
                                title="Edytuj produkt"
                                aria-label="Edytuj produkt"
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-700"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>

                              <button
                                onClick={() => deleteProduct(product.id)}
                                title="Usuń produkt"
                                aria-label="Usuń produkt"
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      </main>
    </>
  );
}