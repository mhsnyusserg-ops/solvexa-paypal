import { NextResponse } from "next/server";

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID!;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;

const SHOPIFY_ORIGIN = process.env.SHOPIFY_ORIGIN || "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": SHOPIFY_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal environment variables are missing.");
  }

  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    "https://api-m.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("PayPal authentication failed:", text);
    throw new Error("PayPal authentication failed.");
  }

  const data = await response.json();

  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const currency = String(
      body.currency || "USD"
    ).toUpperCase();

    const total = Number(body.total);

    const cart = Array.isArray(body.cart)
      ? body.cart
      : [];

    if (!cart.length) {
      return NextResponse.json(
        {
          error: "السلة فارغة.",
        },
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return NextResponse.json(
        {
          error: "إجمالي الطلب غير صالح.",
        },
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    if (currency !== "USD") {
      return NextResponse.json(
        {
          error:
            "العملة الحالية يجب أن تكون USD.",
        },
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    /*
     * Build PayPal item details.
     */
    const items = cart.map((item: any) => {
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "كمية منتج غير صالحة."
        );
      }

      const linePrice = Number(
        item.line_price
      );

      if (
        !Number.isFinite(linePrice) ||
        linePrice <= 0
      ) {
        throw new Error(
          "سعر منتج غير صالح."
        );
      }

      const unitPrice =
        linePrice / 100 / quantity;

      return {
        name: String(
          item.title ||
            "SOLVEXA Product"
        ).slice(0, 127),

        quantity: String(quantity),

        unit_amount: {
          currency_code: currency,
          value: unitPrice.toFixed(2),
        },
      };
    });

    const accessToken =
      await getAccessToken();

    /*
     * Create PayPal order.
     *
     * We intentionally do NOT send
     * breakdown.item_total here because
     * Shopify cart totals can contain
     * discounts or other adjustments.
     */
    const paypalResponse = await fetch(
      "https://api-m.paypal.com/v2/checkout/orders",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",

          "PayPal-Request-Id":
            crypto.randomUUID(),
        },

        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              description:
                "SOLVEXA Shopify Order",

              amount: {
                currency_code:
                  currency,

                value:
                  total.toFixed(2),
              },

              items,
            },
          ],
        }),

        cache: "no-store",
      }
    );

    const order =
      await paypalResponse.json();

    if (!paypalResponse.ok) {
      console.error(
        "PayPal create order error:",
        order
      );

      return NextResponse.json(
        {
          error:
            order?.message ||
            "فشل إنشاء طلب PayPal.",

          details: order,
        },
        {
          status:
            paypalResponse.status,

          headers:
            corsHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        orderID: order.id,
      },
      {
        status: 200,
        headers: corsHeaders(),
      }
    );

  } catch (error) {
    console.error(
      "Create PayPal order error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create PayPal order.",
      },
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
}
