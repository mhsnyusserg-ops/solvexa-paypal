import { NextResponse } from "next/server";

const PAYPAL_CLIENT_ID =
process.env.PAYPAL_CLIENT_ID!;

const PAYPAL_CLIENT_SECRET =
process.env.PAYPAL_CLIENT_SECRET!;

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
Authorization:
`Basic ${auth}`,
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

```
console.error(
  "PayPal authentication failed:",
  text
);

throw new Error(
  "PayPal authentication failed."
);
```

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

```
const orderID =
  String(
    body.orderID || ""
  ).trim();

if (!orderID) {
  return NextResponse.json(
    {
      error:
        "Missing PayPal order ID.",
    },
    {
      status: 400,
      headers:
        corsHeaders(),
    }
  );
}

const accessToken =
  await getAccessToken();

const response =
  await fetch(
    `https://api-m.paypal.com/v2/checkout/orders/${encodeURIComponent(
      orderID
    )}/capture`,
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
      cache: "no-store",
    }
  );

const data =
  await response.json();

if (!response.ok) {
  console.error(
    "PayPal capture error:",
    data
  );

  return NextResponse.json(
    {
      success: false,
      error:
        data?.message ||
        "Failed to capture PayPal payment.",
      details: data,
    },
    {
      status:
        response.status,
      headers:
        corsHeaders(),
    }
  );
}

const captureStatus =
  data?.purchase_units?.[0]
    ?.payments?.captures?.[0]
    ?.status;

const success =
  data?.status === "COMPLETED" ||
  captureStatus === "COMPLETED";

return NextResponse.json(
  {
    success,
    status:
      data?.status,
    captureStatus,
    orderID:
      data?.id,
    payer:
      data?.payer || null,
  },
  {
    status: 200,
    headers:
      corsHeaders(),
  }
);
```

} catch (error) {
console.error(
"Capture PayPal order error:",
error
);

```
return NextResponse.json(
  {
    success: false,
    error:
      error instanceof Error
        ? error.message
        : "Failed to capture PayPal payment.",
  },
  {
    status: 500,
    headers:
      corsHeaders(),
  }
);
```

}
}
