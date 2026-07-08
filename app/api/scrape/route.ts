import { NextResponse } from "next/server";

type ScrapedProduct = {
  name: string;
  price: string;
  image: string;
  store: string;
  category: string;
};

function cleanText(text: string) {
  return String(text || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("\n", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrice(value: unknown) {
  if (value === null || value === undefined) return "";

  const raw = String(value)
    .replace(/\s/g, "")
    .replace("zł", "")
    .replace("PLN", "")
    .replace(",", ".")
    .trim();

  const match = raw.match(/[0-9]+(?:\.[0-9]{1,2})?/);

  if (!match) return "";

  return match[0];
}

function detectStoreFromUrl(url: string) {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("ikea.")) return "IKEA";
  if (lowerUrl.includes("castorama.")) return "Castorama";
  if (lowerUrl.includes("leroymerlin.")) return "Leroy Merlin";
  if (lowerUrl.includes("agatameble.")) return "Agata Meble";
  if (lowerUrl.includes("komfort.")) return "Komfort";
  if (lowerUrl.includes("brw.")) return "Black Red White";
  if (lowerUrl.includes("obi.")) return "OBI";
  if (lowerUrl.includes("jysk.")) return "JYSK";
  if (lowerUrl.includes("home-you.")) return "home&you";
  if (lowerUrl.includes("allegro.")) return "Allegro";
  if (lowerUrl.includes("amazon.")) return "Amazon";
  if (lowerUrl.includes("westwing.")) return "Westwing";

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace("www.", "");
  } catch {
    return "Inny sklep";
  }
}

function detectCategoryFromText(text: string) {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("sofa") ||
    lowerText.includes("kanapa") ||
    lowerText.includes("krzesło") ||
    lowerText.includes("krzeslo") ||
    lowerText.includes("stół") ||
    lowerText.includes("stol") ||
    lowerText.includes("szafa") ||
    lowerText.includes("komoda") ||
    lowerText.includes("fotel") ||
    lowerText.includes("łóżko") ||
    lowerText.includes("lozko")
  ) {
    return "Meble";
  }

  if (
    lowerText.includes("lampa") ||
    lowerText.includes("oświetlenie") ||
    lowerText.includes("oswietlenie") ||
    lowerText.includes("żarówka") ||
    lowerText.includes("zarowka")
  ) {
    return "Oświetlenie";
  }

  if (
    lowerText.includes("płytka") ||
    lowerText.includes("plytka") ||
    lowerText.includes("gres") ||
    lowerText.includes("terakota")
  ) {
    return "Płytki";
  }

  if (
    lowerText.includes("bateria") ||
    lowerText.includes("umywalka") ||
    lowerText.includes("prysznic") ||
    lowerText.includes("wanna") ||
    lowerText.includes("wc") ||
    lowerText.includes("toaleta")
  ) {
    return "Armatura";
  }

  if (
    lowerText.includes("lodówka") ||
    lowerText.includes("lodowka") ||
    lowerText.includes("piekarnik") ||
    lowerText.includes("zmywarka") ||
    lowerText.includes("pralka")
  ) {
    return "AGD";
  }

  if (
    lowerText.includes("dywan") ||
    lowerText.includes("zasłona") ||
    lowerText.includes("zaslona") ||
    lowerText.includes("poduszka") ||
    lowerText.includes("pościel") ||
    lowerText.includes("posciel")
  ) {
    return "Tekstylia";
  }

  if (
    lowerText.includes("panel") ||
    lowerText.includes("podłoga") ||
    lowerText.includes("podloga") ||
    lowerText.includes("parkiet")
  ) {
    return "Podłogi";
  }

  if (
    lowerText.includes("farba") ||
    lowerText.includes("lakier") ||
    lowerText.includes("grunt")
  ) {
    return "Farby";
  }

  if (
    lowerText.includes("drzwi") ||
    lowerText.includes("ościeżnica") ||
    lowerText.includes("oscieznica")
  ) {
    return "Drzwi";
  }

  return "Inne";
}

function extractMetaContent(html: string, property: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);

  if (!titleMatch?.[1]) {
    return "";
  }

  return cleanText(titleMatch[1]);
}

function absoluteImageUrl(imageUrl: string, productUrl: string) {
  if (!imageUrl) return "";

  try {
    return new URL(imageUrl, productUrl).toString();
  } catch {
    return imageUrl;
  }
}

function cleanProductName(name: string, store: string) {
  return cleanText(name)
    .replace(/\s*\|\s*.*$/g, "")
    .replace(/\s*-\s*IKEA.*$/gi, "")
    .replace(/\s*-\s*Castorama.*$/gi, "")
    .replace(/\s*-\s*Leroy Merlin.*$/gi, "")
    .replace(new RegExp(`\\s*-\\s*${store}.*$`, "gi"), "")
    .trim();
}

function findProductObject(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProductObject(item);
      if (found) return found;
    }

    return null;
  }

  const object = data as Record<string, unknown>;
  const type = object["@type"];

  if (
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"))
  ) {
    return object;
  }

  for (const value of Object.values(object)) {
    const found = findProductObject(value);
    if (found) return found;
  }

  return null;
}

function extractJsonLdProduct(html: string) {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  );

  if (!scripts) return null;

  for (const script of scripts) {
    const jsonText = script
      .replace(/<script[^>]*>/i, "")
      .replace(/<\/script>/i, "")
      .trim();

    try {
      const parsed = JSON.parse(jsonText);
      const product = findProductObject(parsed);

      if (product) {
        return product;
      }
    } catch {
      // Pomijamy błędny JSON-LD
    }
  }

  return null;
}

function getImageFromProduct(product: Record<string, unknown> | null) {
  if (!product) return "";

  const image = product.image;

  if (typeof image === "string") return image;

  if (Array.isArray(image) && typeof image[0] === "string") {
    return image[0];
  }

  if (image && typeof image === "object") {
    const imageObject = image as Record<string, unknown>;

    if (typeof imageObject.url === "string") {
      return imageObject.url;
    }
  }

  return "";
}

function getPriceFromProduct(product: Record<string, unknown> | null) {
  if (!product) return "";

  const offers = product.offers;

  if (offers && typeof offers === "object") {
    if (Array.isArray(offers)) {
      const firstOffer = offers[0];

      if (firstOffer && typeof firstOffer === "object") {
        const offerObject = firstOffer as Record<string, unknown>;
        return normalizePrice(
          offerObject.price ||
            offerObject.lowPrice ||
            offerObject.highPrice
        );
      }
    } else {
      const offerObject = offers as Record<string, unknown>;

      return normalizePrice(
        offerObject.price ||
          offerObject.lowPrice ||
          offerObject.highPrice
      );
    }
  }

  return normalizePrice(product.price);
}

function extractPriceFromHtml(html: string) {
  const patterns = [
    /"price"\s*:\s*"([^"]+)"/i,
    /"price"\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /"currentPrice"\s*:\s*"([^"]+)"/i,
    /"currentPrice"\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /"value"\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /([0-9]+(?:[.,][0-9]{2})?)\s*zł/i,
    /([0-9]+(?:[.,][0-9]{2})?)\s*PLN/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return normalizePrice(match[1]);
    }
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json(
        { error: "Brak linku do produktu." },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            "Nie udało się pobrać strony produktu. Sklep może blokować automatyczne pobieranie danych.",
        },
        { status: 400 }
      );
    }

    const html = await response.text();
    const store = detectStoreFromUrl(url);
    const jsonLdProduct = extractJsonLdProduct(html);

    const jsonLdName =
      jsonLdProduct && typeof jsonLdProduct.name === "string"
        ? jsonLdProduct.name
        : "";

    const metaName =
      extractMetaContent(html, "og:title") ||
      extractMetaContent(html, "twitter:title") ||
      extractTitle(html);

    const rawName = jsonLdName || metaName || "Produkt z linku";

    const rawImage =
      getImageFromProduct(jsonLdProduct) ||
      extractMetaContent(html, "og:image") ||
      extractMetaContent(html, "twitter:image");

    const price =
      getPriceFromProduct(jsonLdProduct) || extractPriceFromHtml(html);

    const name = cleanProductName(rawName, store);

    const product: ScrapedProduct = {
      name,
      price,
      image: absoluteImageUrl(rawImage, url),
      store,
      category: detectCategoryFromText(name),
    };

    return NextResponse.json(product);
  } catch {
    return NextResponse.json(
      {
        error:
          "Wystąpił błąd podczas pobierania danych. Spróbuj innego linku albo uzupełnij dane ręcznie.",
      },
      { status: 500 }
    );
  }
}
