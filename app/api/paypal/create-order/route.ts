import { NextResponse } from "next/server";

const PAYPAL_API = "https://api-m.paypal.com";

const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
return new NextResponse(null, {
status: 204,
headers: corsHeaders,
});
}

async function getAccessToken() {
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
throw new Error("PayPal environment variables are missing.");
}

const auth = Buffer.from(
`${clientId}:${clientSecret}`
).toString("base64");

const response = await fetch(
`${PAYPAL_API}/v1/oauth2/token`,
{
method: "POST",
headers: {
Authorization: `Basic ${auth}`,
"Content-Type": "application/x-www-form-urlencoded",
},
body: "grant_type=client_credentials",
}
);

if (!response.ok) {
const text = await response.text();

```
throw new Error(
  `PayPal authentication failed: ${text}`
);
```

}

const data = await response.json();

return data.access_token;
}

export async function POST(request: Request) {
try {
const body = await request.json();

```
const amount = Number(body.amount);
const quantity = Math.max(
  1,
  Number(body.quantity || 1)
);

if (!Number.isFinite(amount) || amount <= 0) {
  return NextResponse.json(
    {
      error: "Invalid product amount.",
    },
    {
      status: 400,
      headers: corsHeaders,
    }
  );
}

const total = (
  amount * quantity
).toFixed(2);

const accessToken = await getAccessToken();

const orderResponse = await fetch(
  `${PAYPAL_API}/v2/checkout/orders`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",

      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: total,
          },
        },
      ],

      application_context: {
        brand_name: "SOLVEXA",
        user_action: "PAY_NOW",
        shipping_preference: "GET_FROM_FILE",

        return_url:
          "https://solvexa-paypal.vercel.app/api/paypal/success",

        cancel_url:
          "https://solvexa-paypal.vercel.app/api/paypal/cancel",
      },
    }),
  }
);

const orderData = await orderResponse.json();

if (!orderResponse.ok) {
  return NextResponse.json(
    {
      error:
        "PayPal could not create the order.",
      details: orderData,
    },
    {
      status: 500,
      headers: corsHeaders,
    }
  );
}

const approvalLink =
  orderData.links?.find(
    (link: { rel: string }) =>
      link.rel === "approve"
  )?.href;

if (!approvalLink) {
  return NextResponse.json(
    {
      error:
        "PayPal approval link was not returned.",
      details: orderData,
    },
    {
      status: 500,
      headers: corsHeaders,
    }
  );
}

return NextResponse.json(
  {
    orderID: orderData.id,
    approvalUrl: approvalLink,
  },
  {
    status: 200,
    headers: corsHeaders,
  }
);
```

} catch (error) {
console.error(
"PayPal create-order error:",
error
);

```
return NextResponse.json(
  {
    error:
      error instanceof Error
        ? error.message
        : "Unknown PayPal error.",
  },
  {
    status: 500,
    headers: corsHeaders,
  }
);
```

}
}
