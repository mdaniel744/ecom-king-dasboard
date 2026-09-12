# Storefront form submission contract

Use the store UUID or store slug in `{storeId}`. Both endpoints accept JSON and return `201` when a record is created.

## Standard checkout → Orders

`POST /api/storefront/checkout/{storeId}`

```json
{
  "locale": "de",
  "market": "DE",
  "clientReference": "WEB-20260903-1042",
  "customerName": "Anna Meyer",
  "customerEmail": "anna@example.com",
  "customerPhone": "+49 30 123456",
  "customerDetails": {
    "customer_type": "Business",
    "purchase_order_number": "PO-8042"
  },
  "billingAddress": {
    "full_name": "Anna Meyer",
    "company": "Meyer Handel GmbH",
    "email": "anna@example.com",
    "phone": "+49 30 123456",
    "vat_number": "DE123456789",
    "address_line_1": "Hauptstrasse 10",
    "address_line_2": "2. Etage",
    "city": "Berlin",
    "state": "Berlin",
    "postal_code": "10115",
    "country": "Germany",
    "country_code": "DE"
  },
  "deliveryAddress": {
    "full_name": "Warehouse Receiving",
    "company": "Meyer Handel GmbH",
    "address_line_1": "Lagerweg 4",
    "city": "Berlin",
    "postal_code": "10117",
    "country": "Germany",
    "country_code": "DE",
    "delivery_instructions": "Call 30 minutes before arrival"
  },
  "shippingAmount": 85,
  "deliveryMethod": "Freight delivery",
  "customerNote": "Deliver Monday to Friday.",
  "formFields": {
    "terms_accepted": true
  },
  "lineItems": [
    {
      "productId": "00000000-0000-4000-8000-000000000401",
      "quantity": 1,
      "productUrl": "https://store.example/de/products/20ft-high-cube",
      "configuration": {
        "Size": "20ft high cube",
        "Colour": "RAL 5010 Blue",
        "Condition": "New"
      }
    }
  ]
}
```

Product prices and VAT are recalculated by the dashboard from the saved product and selected delivery market. `shippingAmount` is the storefront-calculated delivery amount in that market's currency and is added separately to the checkout total.

## Request a quote → Inquiries

`POST /api/storefront/inquiries/{storeId}`

```json
{
  "locale": "en",
  "customerName": "Anna Meyer",
  "customerEmail": "anna@example.com",
  "customerPhone": "+49 30 123456",
  "customerCompany": "Meyer Handel GmbH",
  "customerDetails": {
    "preferred_contact_method": "Email",
    "purchase_timeline": "Within 30 days"
  },
  "billingAddress": {
    "full_name": "Anna Meyer",
    "company": "Meyer Handel GmbH",
    "address_line_1": "Hauptstrasse 10",
    "city": "Berlin",
    "postal_code": "10115",
    "country": "Germany"
  },
  "deliveryAddress": {
    "company": "Meyer Handel GmbH",
    "address_line_1": "Lagerweg 4",
    "city": "Berlin",
    "postal_code": "10117",
    "country": "Germany"
  },
  "productId": "00000000-0000-4000-8000-000000000401",
  "productName": "20ft High Cube Container",
  "productType": "Shipping container",
  "productUrl": "https://store.example/products/20ft-high-cube",
  "productImage": "https://store.example/images/20ft-high-cube.jpg",
  "quantity": 3,
  "productConfiguration": {
    "Size": "20ft high cube",
    "Colour": "RAL 5010 Blue",
    "Condition": "New",
    "Lockbox": "Included"
  },
  "formFields": {
    "required_delivery_date": "2026-10-15",
    "offloading_required": true,
    "site_access_notes": "Maximum vehicle height 4.2m"
  },
  "message": "Please include delivery and offloading in the quotation."
}
```

`productId` is preferred because it lets the dashboard verify and snapshot the current product. For products not yet stored in the dashboard, send `productName` or `productUrl`. Every address and additional field is optional; omitted values remain blank in the management screen. An email address or phone number is required so staff can respond.
