```ts
import { NextResponse } from "next/server";

const PAYPAL_CLIENT_ID =
  process.env.PAYPAL_CLIENT_ID!;

const PAYPAL_CLIENT_SECRET =
  process.env.PAYPAL_CLIENT_SECRET!;

/*
 * IMPORTANT:
 * Put your Shopify store domain here.
 *
 * Example:
 * https://solvexa.com
 *
 * Do NOT put the Vercel domain here.
 *
 * For the first test, you can temporarily use "*"
 * instead of SHOPIFY_ORIGIN.
 */
const SHOPIFY_ORIGIN =
  process.env.SHOPIFY_ORIGIN || "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      SHOPIFY_ORIGIN,
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function getAccessToken() {
  if (
    !PAYPAL_CLIENT_ID ||
    !PAYPAL_CLIENT_SECRET
  ) {
    throw new Error(
      "PayPal environment variables are missing."
    );
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
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body:
        "grant_type=client_credentials",

      cache: "no-store",
    }
  );

  if (!response.ok) {
    const text =
      await response.text();

    console.error(
      "PayPal authentication failed:",
      text
    );

    throw new Error(
      "PayPal authentication failed."
    );
  }

  const data =
    await response.json();

  return data.access_token;
}

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const currency =
      String(
        body.currency || "USD"
      ).toUpperCase();

    const total =
      Number(body.total);

    const cart =
      Array.isArray(body.cart)
        ? body.cart
        : [];

    if (
      !cart.length
    ) {
      return NextResponse.json(
        {
          error:
            "السلة فارغة.",
        },
        {
          status: 400,
          headers:
            corsHeaders(),
        }
      );
    }

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "إجمالي الطلب غير صالح.",
        },
        {
          status: 400,
          headers:
            corsHeaders(),
        }
      );
    }

    /*
     * Basic validation of each cart line.
     */
    for (const item of cart) {
      const quantity =
        Number(item.quantity);

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "كمية منتج غير صالحة.",
          },
          {
            status: 400,
            headers:
              corsHeaders(),
          }
        );
      }
    }

    /*
     * Get PayPal OAuth access token.
     */
    const accessToken =
      await getAccessToken();

    /*
     * Build PayPal item details.
     *
     * PayPal accepts item breakdown information.
     */
    const items = cart.map(
      (item: any) => {
        const quantity =
          Number(item.quantity);

        const linePrice =
          Number(
            item.line_price
          ) / 100;

        const unitPrice =
          linePrice /
          quantity;

        return {
          name: String(
            item.title ||
              "SOLVEXA Product"
          ).slice(0, 127),

          sku: item.sku
            ? String(item.sku).slice(
                0,
                127
              )
            : undefined,

          quantity:
            String(quantity),

          unit_amount: {
            currency_code:
              currency,
            value:
              unitPrice.toFixed(2),
          },
        };
      }
    );

    /*
     * Remove undefined SKU fields.
     */
    const cleanedItems =
      items.map(
        (item: any) => {
          if (!item.sku) {
            delete item.sku;
          }

          return item;
        }
      );

    const paypalResponse =
      await fetch(
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

                  breakdown: {
                    item_total: {
                      currency_code:
                        currency,

                      value:
                        total.toFixed(2),
                    },
                  },
                },

                items:
                  cleanedItems,
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
        orderID:
          order.id,
      },
      {
        status: 200,
        headers:
          corsHeaders(),
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
        headers:
          corsHeaders(),
      }
    );
  }
}
```
