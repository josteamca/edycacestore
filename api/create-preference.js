// Vercel Serverless Function — Mercado Pago Checkout Pro
// Recibe datos del pedido desde el frontend y devuelve la URL de pago de MP.
// Requiere variable de entorno MP_ACCESS_TOKEN configurada en Vercel.

import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
  // CORS basico (mismo dominio normalmente, pero por si acaso)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({
      error: 'Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Vercel.',
    });
  }

  try {
    // Vercel parsea JSON automaticamente cuando Content-Type es application/json
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { product, price, quantity = 1, customer = {} } = body;

    if (!product || !price) {
      return res.status(400).json({ error: 'Faltan campos: product y price.' });
    }

    // El precio puede llegar como "S/ 50" o "50" o 50 — normalizamos
    const unitPrice = parseFloat(String(price).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (isNaN(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ error: 'Precio invalido.' });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // URL base para back_urls (success/failure/pending)
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;

    const isTest = accessToken.startsWith('TEST-');

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const safeId = String(product).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    const itemTitle = String(product).slice(0, 250);

    const payerInfo = {};
    if (customer.firstName) payerInfo.name = String(customer.firstName).slice(0, 100);
    if (customer.lastName)  payerInfo.surname = String(customer.lastName).slice(0, 100);
    if (customer.email)     payerInfo.email = String(customer.email).slice(0, 200);
    if (customer.phone) {
      payerInfo.phone = { number: String(customer.phone).replace(/\D/g, '').slice(0, 20) };
    }

    const result = await preference.create({
      body: {
        items: [{
          id: `edycace-${safeId}`,
          title: itemTitle,
          description: 'Tiras nasales — EDYCACE STORE',
          quantity: qty,
          unit_price: unitPrice,
          currency_id: 'PEN',
        }],
        payer: Object.keys(payerInfo).length ? payerInfo : undefined,
        back_urls: {
          success: `${baseUrl}/?status=success`,
          failure: `${baseUrl}/?status=failure`,
          pending: `${baseUrl}/?status=pending`,
        },
        auto_return: 'approved',
        statement_descriptor: 'EDYCACE STORE',
        metadata: {
          notes: customer.notes ? String(customer.notes).slice(0, 500) : '',
          phone: customer.phone || '',
        },
      },
    });

    return res.status(200).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      mode: isTest ? 'sandbox' : 'production',
    });
  } catch (err) {
    // Log para los logs de Vercel
    console.error('MP create-preference error:', err);
    const message = err && err.message ? err.message : 'Error desconocido creando la preferencia.';
    return res.status(500).json({ error: message });
  }
}
