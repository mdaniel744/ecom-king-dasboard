/**
 * Fixed UI labels for the customer-facing checkout invoice email
 * (lib/checkout-invoice.ts). This is deliberately a small, hand-reviewed
 * dictionary rather than the AI translation pipeline used for product
 * content (lib/translate.ts) — these strings touch legal/financial wording
 * (VAT, deposits, payment terms) that should never ship unreviewed.
 *
 * Scope: the languages real stores actually use today (see each store's
 * google_content_language / enabled_locales). Add a locale here when a
 * store genuinely needs it; anything else falls back to English.
 */

export type InvoiceLocale = "en" | "de" | "nl" | "fr" | "es" | "it" | "cs" | "da" | "pl";

export const SUPPORTED_INVOICE_LOCALES: InvoiceLocale[] = [
  "en",
  "de",
  "nl",
  "fr",
  "es",
  "it",
  "cs",
  "da",
  "pl",
];

export type InvoiceStrings = {
  invoiceWord: string;
  issued: string;
  due: string;
  order: string;
  billingAddress: string;
  deliveryAddress: string;
  invoiceDetails: string;
  accountManager: string;
  invoiceDate: string;
  paymentTermsLabel: string;
  deliveryLabel: string;
  contactNotConfigured: string;
  from: string;
  billTo: string;
  thankYou: string;
  product: string;
  qty: string;
  unitPrice: string;
  total: string;
  subtotal: string;
  discount: string;
  tax: string;
  bankTransferDetails: string;
  accountName: string;
  accountNumber: string;
  transferCurrency: string;
  iban: string;
  swiftBic: string;
  termsAndInstructions: string;
  paymentSetupRequired: string;
  companyNo: string;
  vatId: string;
  taxId: string;
  registeredOffice: string;
  registeredAddressNotConfigured: string;
  contact: string;
  greeting: (name: string) => string;
  depositRequired: (percent: number) => string;
  bankCurrencyUnavailable: (currency: string, contact: string) => string;
  defaultPaymentTerms: (days: number) => string;
  defaultDeliveryTerms: string;
  invoiceSubject: (invoiceNumber: string, orderNumber: string) => string;
};

const en: InvoiceStrings = {
  invoiceWord: "Invoice",
  issued: "Issued",
  due: "Due",
  order: "Order",
  billingAddress: "Billing address",
  deliveryAddress: "Delivery address",
  invoiceDetails: "Invoice details",
  accountManager: "Account manager",
  invoiceDate: "Invoice date",
  paymentTermsLabel: "Payment terms",
  deliveryLabel: "Delivery",
  contactNotConfigured: "Contact details not configured",
  from: "From",
  billTo: "Bill to",
  thankYou: "Thank you for your order. Your invoice details are below.",
  product: "Product",
  qty: "Qty",
  unitPrice: "Unit price",
  total: "Total",
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Tax",
  bankTransferDetails: "Bank transfer details",
  accountName: "Account name",
  accountNumber: "Account number",
  transferCurrency: "Transfer currency",
  iban: "IBAN",
  swiftBic: "SWIFT / BIC",
  termsAndInstructions: "Terms & instructions",
  paymentSetupRequired: "Payment setup required",
  companyNo: "Company no.",
  vatId: "VAT ID",
  taxId: "Tax ID",
  registeredOffice: "Registered office",
  registeredAddressNotConfigured: "Registered address not configured",
  contact: "Contact",
  greeting: (name) => `Hello ${name},`,
  depositRequired: (percent) => `${percent}% deposit required`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Bank-transfer instructions for ${currency} are not configured. Please contact ${contact} before paying.`,
  defaultPaymentTerms: (days) => `Payment due within ${days} days.`,
  defaultDeliveryTerms: "Delivery timing will be confirmed with your order.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Invoice ${invoiceNumber} for order ${orderNumber}`,
};

const de: InvoiceStrings = {
  invoiceWord: "Rechnung",
  issued: "Ausgestellt am",
  due: "Fällig am",
  order: "Bestellung",
  billingAddress: "Rechnungsadresse",
  deliveryAddress: "Lieferadresse",
  invoiceDetails: "Rechnungsdetails",
  accountManager: "Kundenbetreuer",
  invoiceDate: "Rechnungsdatum",
  paymentTermsLabel: "Zahlungsbedingungen",
  deliveryLabel: "Lieferung",
  contactNotConfigured: "Keine Kontaktdaten hinterlegt",
  from: "Von",
  billTo: "Rechnung an",
  thankYou: "Vielen Dank für Ihre Bestellung. Ihre Rechnungsdetails finden Sie unten.",
  product: "Produkt",
  qty: "Menge",
  unitPrice: "Einzelpreis",
  total: "Gesamt",
  subtotal: "Zwischensumme",
  discount: "Rabatt",
  tax: "MwSt.",
  bankTransferDetails: "Bankverbindung",
  accountName: "Kontoinhaber",
  accountNumber: "Kontonummer",
  transferCurrency: "Überweisungswährung",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Bedingungen & Hinweise",
  paymentSetupRequired: "Zahlungseinrichtung erforderlich",
  companyNo: "Handelsregister-Nr.",
  vatId: "USt-IdNr.",
  taxId: "Steuernummer",
  registeredOffice: "Geschäftssitz",
  registeredAddressNotConfigured: "Keine Geschäftsadresse hinterlegt",
  contact: "Kontakt",
  greeting: (name) => `Hallo ${name},`,
  depositRequired: (percent) => `${percent}% Anzahlung erforderlich`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Für ${currency} sind keine Überweisungsdaten hinterlegt. Bitte kontaktieren Sie ${contact}, bevor Sie zahlen.`,
  defaultPaymentTerms: (days) => `Zahlbar innerhalb von ${days} Tagen.`,
  defaultDeliveryTerms: "Der Liefertermin wird mit Ihrer Bestellung bestätigt.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Rechnung ${invoiceNumber} zur Bestellung ${orderNumber}`,
};

const nl: InvoiceStrings = {
  invoiceWord: "Factuur",
  issued: "Uitgegeven op",
  due: "Vervaldatum",
  order: "Bestelling",
  billingAddress: "Factuuradres",
  deliveryAddress: "Afleveradres",
  invoiceDetails: "Factuurgegevens",
  accountManager: "Accountmanager",
  invoiceDate: "Factuurdatum",
  paymentTermsLabel: "Betalingsvoorwaarden",
  deliveryLabel: "Levering",
  contactNotConfigured: "Geen contactgegevens ingesteld",
  from: "Van",
  billTo: "Factuur aan",
  thankYou: "Bedankt voor uw bestelling. Uw factuurgegevens vindt u hieronder.",
  product: "Product",
  qty: "Aantal",
  unitPrice: "Stukprijs",
  total: "Totaal",
  subtotal: "Subtotaal",
  discount: "Korting",
  tax: "Btw",
  bankTransferDetails: "Bankgegevens",
  accountName: "Naam rekeninghouder",
  accountNumber: "Rekeningnummer",
  transferCurrency: "Valuta overschrijving",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Voorwaarden & instructies",
  paymentSetupRequired: "Betaalinstellingen vereist",
  companyNo: "KvK-nummer",
  vatId: "Btw-nummer",
  taxId: "Fiscaal nummer",
  registeredOffice: "Statutaire zetel",
  registeredAddressNotConfigured: "Geen bedrijfsadres ingesteld",
  contact: "Contact",
  greeting: (name) => `Hallo ${name},`,
  depositRequired: (percent) => `${percent}% aanbetaling vereist`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Overschrijvingsgegevens voor ${currency} zijn niet ingesteld. Neem contact op met ${contact} voordat u betaalt.`,
  defaultPaymentTerms: (days) => `Betaling binnen ${days} dagen verschuldigd.`,
  defaultDeliveryTerms: "De levertijd wordt bevestigd bij uw bestelling.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Factuur ${invoiceNumber} voor bestelling ${orderNumber}`,
};

const fr: InvoiceStrings = {
  invoiceWord: "Facture",
  issued: "Émise le",
  due: "Échéance",
  order: "Commande",
  billingAddress: "Adresse de facturation",
  deliveryAddress: "Adresse de livraison",
  invoiceDetails: "Détails de la facture",
  accountManager: "Gestionnaire de compte",
  invoiceDate: "Date de facture",
  paymentTermsLabel: "Conditions de paiement",
  deliveryLabel: "Livraison",
  contactNotConfigured: "Coordonnées non renseignées",
  from: "De",
  billTo: "Facturé à",
  thankYou: "Merci pour votre commande. Les détails de votre facture figurent ci-dessous.",
  product: "Produit",
  qty: "Qté",
  unitPrice: "Prix unitaire",
  total: "Total",
  subtotal: "Sous-total",
  discount: "Remise",
  tax: "TVA",
  bankTransferDetails: "Coordonnées bancaires",
  accountName: "Titulaire du compte",
  accountNumber: "Numéro de compte",
  transferCurrency: "Devise du virement",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Conditions & instructions",
  paymentSetupRequired: "Configuration du paiement requise",
  companyNo: "N° d'immatriculation",
  vatId: "N° de TVA",
  taxId: "Numéro fiscal",
  registeredOffice: "Siège social",
  registeredAddressNotConfigured: "Adresse du siège non renseignée",
  contact: "Contact",
  greeting: (name) => `Bonjour ${name},`,
  depositRequired: (percent) => `Acompte de ${percent}% requis`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Les coordonnées de virement pour ${currency} ne sont pas configurées. Veuillez contacter ${contact} avant de payer.`,
  defaultPaymentTerms: (days) => `Paiement exigible sous ${days} jours.`,
  defaultDeliveryTerms: "Le délai de livraison sera confirmé avec votre commande.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Facture ${invoiceNumber} pour la commande ${orderNumber}`,
};

const es: InvoiceStrings = {
  invoiceWord: "Factura",
  issued: "Emitida el",
  due: "Vencimiento",
  order: "Pedido",
  billingAddress: "Dirección de facturación",
  deliveryAddress: "Dirección de entrega",
  invoiceDetails: "Detalles de la factura",
  accountManager: "Gestor de cuenta",
  invoiceDate: "Fecha de factura",
  paymentTermsLabel: "Condiciones de pago",
  deliveryLabel: "Entrega",
  contactNotConfigured: "Datos de contacto no configurados",
  from: "De",
  billTo: "Facturar a",
  thankYou: "Gracias por su pedido. Los detalles de su factura se muestran a continuación.",
  product: "Producto",
  qty: "Cant.",
  unitPrice: "Precio unitario",
  total: "Total",
  subtotal: "Subtotal",
  discount: "Descuento",
  tax: "IVA",
  bankTransferDetails: "Datos bancarios",
  accountName: "Titular de la cuenta",
  accountNumber: "Número de cuenta",
  transferCurrency: "Divisa de la transferencia",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Condiciones e instrucciones",
  paymentSetupRequired: "Configuración de pago requerida",
  companyNo: "N.º de registro mercantil",
  vatId: "NIF/IVA",
  taxId: "Número fiscal",
  registeredOffice: "Domicilio social",
  registeredAddressNotConfigured: "Dirección social no configurada",
  contact: "Contacto",
  greeting: (name) => `Hola ${name},`,
  depositRequired: (percent) => `Depósito del ${percent}% requerido`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Los datos de transferencia para ${currency} no están configurados. Póngase en contacto con ${contact} antes de pagar.`,
  defaultPaymentTerms: (days) => `Pago exigible en un plazo de ${days} días.`,
  defaultDeliveryTerms: "El plazo de entrega se confirmará con su pedido.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Factura ${invoiceNumber} del pedido ${orderNumber}`,
};

const it: InvoiceStrings = {
  invoiceWord: "Fattura",
  issued: "Emessa il",
  due: "Scadenza",
  order: "Ordine",
  billingAddress: "Indirizzo di fatturazione",
  deliveryAddress: "Indirizzo di consegna",
  invoiceDetails: "Dettagli fattura",
  accountManager: "Account manager",
  invoiceDate: "Data fattura",
  paymentTermsLabel: "Termini di pagamento",
  deliveryLabel: "Consegna",
  contactNotConfigured: "Dati di contatto non configurati",
  from: "Da",
  billTo: "Fatturato a",
  thankYou: "Grazie per il tuo ordine. I dettagli della fattura sono riportati di seguito.",
  product: "Prodotto",
  qty: "Qtà",
  unitPrice: "Prezzo unitario",
  total: "Totale",
  subtotal: "Subtotale",
  discount: "Sconto",
  tax: "IVA",
  bankTransferDetails: "Dati bancari",
  accountName: "Intestatario del conto",
  accountNumber: "Numero di conto",
  transferCurrency: "Valuta del bonifico",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Termini e istruzioni",
  paymentSetupRequired: "Configurazione del pagamento richiesta",
  companyNo: "N. di registro",
  vatId: "P. IVA",
  taxId: "Codice fiscale",
  registeredOffice: "Sede legale",
  registeredAddressNotConfigured: "Indirizzo della sede non configurato",
  contact: "Contatto",
  greeting: (name) => `Ciao ${name},`,
  depositRequired: (percent) => `Acconto del ${percent}% richiesto`,
  bankCurrencyUnavailable: (currency, contact) =>
    `I dati per il bonifico in ${currency} non sono configurati. Contatta ${contact} prima di pagare.`,
  defaultPaymentTerms: (days) => `Pagamento dovuto entro ${days} giorni.`,
  defaultDeliveryTerms: "I tempi di consegna saranno confermati con il tuo ordine.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Fattura ${invoiceNumber} per l'ordine ${orderNumber}`,
};

const cs: InvoiceStrings = {
  invoiceWord: "Faktura",
  issued: "Vystaveno dne",
  due: "Splatnost",
  order: "Objednávka",
  billingAddress: "Fakturační adresa",
  deliveryAddress: "Dodací adresa",
  invoiceDetails: "Údaje o faktuře",
  accountManager: "Obchodní zástupce",
  invoiceDate: "Datum vystavení",
  paymentTermsLabel: "Platební podmínky",
  deliveryLabel: "Doručení",
  contactNotConfigured: "Kontaktní údaje nejsou nastaveny",
  from: "Od",
  billTo: "Fakturovat na",
  thankYou: "Děkujeme za vaši objednávku. Podrobnosti faktury naleznete níže.",
  product: "Produkt",
  qty: "Množ.",
  unitPrice: "Jednotková cena",
  total: "Celkem",
  subtotal: "Mezisoučet",
  discount: "Sleva",
  tax: "DPH",
  bankTransferDetails: "Bankovní spojení",
  accountName: "Majitel účtu",
  accountNumber: "Číslo účtu",
  transferCurrency: "Měna platby",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Podmínky a pokyny",
  paymentSetupRequired: "Je nutné nastavit platbu",
  companyNo: "IČO",
  vatId: "DIČ",
  taxId: "Daňové číslo",
  registeredOffice: "Sídlo společnosti",
  registeredAddressNotConfigured: "Sídlo společnosti není nastaveno",
  contact: "Kontakt",
  greeting: (name) => `Dobrý den ${name},`,
  depositRequired: (percent) => `Vyžadována záloha ${percent} %`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Platební údaje pro měnu ${currency} nejsou nastaveny. Před platbou prosím kontaktujte ${contact}.`,
  defaultPaymentTerms: (days) => `Splatnost do ${days} dnů.`,
  defaultDeliveryTerms: "Termín dodání bude potvrzen u vaší objednávky.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Faktura ${invoiceNumber} k objednávce ${orderNumber}`,
};

const da: InvoiceStrings = {
  invoiceWord: "Faktura",
  issued: "Udstedt den",
  due: "Forfaldsdato",
  order: "Ordre",
  billingAddress: "Faktureringsadresse",
  deliveryAddress: "Leveringsadresse",
  invoiceDetails: "Fakturaoplysninger",
  accountManager: "Kontoansvarlig",
  invoiceDate: "Fakturadato",
  paymentTermsLabel: "Betalingsbetingelser",
  deliveryLabel: "Levering",
  contactNotConfigured: "Ingen kontaktoplysninger angivet",
  from: "Fra",
  billTo: "Faktureres til",
  thankYou: "Tak for din ordre. Dine fakturaoplysninger fremgår nedenfor.",
  product: "Produkt",
  qty: "Antal",
  unitPrice: "Stykpris",
  total: "I alt",
  subtotal: "Subtotal",
  discount: "Rabat",
  tax: "Moms",
  bankTransferDetails: "Bankoplysninger",
  accountName: "Kontonavn",
  accountNumber: "Kontonummer",
  transferCurrency: "Overførselsvaluta",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Vilkår & instruktioner",
  paymentSetupRequired: "Betalingsopsætning påkrævet",
  companyNo: "CVR-nr.",
  vatId: "Moms-nr.",
  taxId: "Skatte-ID",
  registeredOffice: "Registreret adresse",
  registeredAddressNotConfigured: "Ingen registreret adresse angivet",
  contact: "Kontakt",
  greeting: (name) => `Hej ${name},`,
  depositRequired: (percent) => `${percent}% depositum påkrævet`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Overførselsoplysninger for ${currency} er ikke konfigureret. Kontakt venligst ${contact}, før du betaler.`,
  defaultPaymentTerms: (days) => `Betaling forfalder inden ${days} dage.`,
  defaultDeliveryTerms: "Leveringstidspunktet bekræftes sammen med din ordre.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Faktura ${invoiceNumber} for ordre ${orderNumber}`,
};

const pl: InvoiceStrings = {
  invoiceWord: "Faktura",
  issued: "Wystawiono",
  due: "Termin płatności",
  order: "Zamówienie",
  billingAddress: "Adres rozliczeniowy",
  deliveryAddress: "Adres dostawy",
  invoiceDetails: "Szczegóły faktury",
  accountManager: "Opiekun klienta",
  invoiceDate: "Data wystawienia",
  paymentTermsLabel: "Warunki płatności",
  deliveryLabel: "Dostawa",
  contactNotConfigured: "Brak skonfigurowanych danych kontaktowych",
  from: "Od",
  billTo: "Nabywca",
  thankYou: "Dziękujemy za zamówienie. Szczegóły faktury znajdziesz poniżej.",
  product: "Produkt",
  qty: "Ilość",
  unitPrice: "Cena jednostkowa",
  total: "Razem",
  subtotal: "Suma częściowa",
  discount: "Rabat",
  tax: "VAT",
  bankTransferDetails: "Dane bankowe",
  accountName: "Nazwa posiadacza konta",
  accountNumber: "Numer konta",
  transferCurrency: "Waluta przelewu",
  iban: "IBAN",
  swiftBic: "SWIFT/BIC",
  termsAndInstructions: "Warunki i instrukcje",
  paymentSetupRequired: "Wymagana konfiguracja płatności",
  companyNo: "Nr KRS",
  vatId: "NIP",
  taxId: "Nr podatkowy",
  registeredOffice: "Siedziba firmy",
  registeredAddressNotConfigured: "Brak skonfigurowanego adresu siedziby",
  contact: "Kontakt",
  greeting: (name) => `Witaj ${name},`,
  depositRequired: (percent) => `Wymagana zaliczka ${percent}%`,
  bankCurrencyUnavailable: (currency, contact) =>
    `Dane do przelewu w walucie ${currency} nie zostały skonfigurowane. Skontaktuj się z ${contact} przed dokonaniem płatności.`,
  defaultPaymentTerms: (days) => `Płatność wymagalna w ciągu ${days} dni.`,
  defaultDeliveryTerms: "Termin dostawy zostanie potwierdzony wraz z zamówieniem.",
  invoiceSubject: (invoiceNumber, orderNumber) => `Faktura ${invoiceNumber} do zamówienia ${orderNumber}`,
};

const DICTIONARY: Record<InvoiceLocale, InvoiceStrings> = { en, de, nl, fr, es, it, cs, da, pl };

export function normalizeInvoiceLocale(locale: string | null | undefined): InvoiceLocale {
  const code = (locale || "").trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_INVOICE_LOCALES as string[]).includes(code) ? (code as InvoiceLocale) : "en";
}

export function getInvoiceStrings(locale: string | null | undefined): InvoiceStrings {
  return DICTIONARY[normalizeInvoiceLocale(locale)];
}
