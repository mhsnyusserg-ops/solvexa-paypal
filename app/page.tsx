
"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
    Shopify?: {
      routes?: {
        root?: string;
      };
    };
  }
}

const PAYPAL_CLIENT_ID =
  "BAAYbwj3MQtsQAOsgglGMuJQ2gos-UyXudaAXhtKBJUzJJlzFCY6VZU_ZOkFE0GSqAoHjIlrkxt8nX0sG4";

type ShopifyCartItem = {
  id: number;
  product_id: number;
  variant_id: number;
  product_title: string;
  title: string;
  quantity: number;
  sku: string | null;
  price: number;
  final_price: number;
  line_price: number;
  final_line_price: number;
};

type ShopifyCart = {
  currency: string;
  total_price: number;
  items: ShopifyCartItem[];
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<ShopifyCart | null>(null);

  useEffect(() => {
    let mounted = true;

    const getShopifyCart = async () => {
      try {
        /*
         * This page can run on the Vercel domain for testing,
         * or inside the Shopify store.
         *
         * If it is running inside Shopify, window.Shopify.routes.root
         * is used to access the current customer's cart.
         */
        if (
          typeof window === "undefined" ||
          !window.Shopify?.routes?.root
        ) {
          setCartLoading(false);
          return;
        }

        const root = window.Shopify.routes.root;

        const response = await fetch(`${root}cart.js`, {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("تعذر قراءة سلة Shopify");
        }

        const data: ShopifyCart = await response.json();

        if (!mounted) return;

        setCart(data);
      } catch (err) {
        console.error(err);

        if (mounted) {
          setError("تعذر قراءة سلة Shopify.");
        }
      } finally {
        if (mounted) {
          setCartLoading(false);
        }
      }
    };

    const renderPayPal = () => {
      if (!window.paypal) {
        setError("PayPal غير متاح حاليًا.");
        setLoading(false);
        return;
      }

      const container = document.getElementById(
        "paypal-button-container"
      );

      if (!container) return;

      if (container.children.length > 0) return;

      window.paypal
        .Buttons({
          style: {
            layout: "vertical",
            shape: "rect",
            label: "paypal",
          },

          async createOrder() {
            /*
             * Always read the cart again immediately before payment.
             * This prevents using an old cart total if the customer
             * changed the cart after the page loaded.
             */
            if (
              typeof window === "undefined" ||
              !window.Shopify?.routes?.root
            ) {
              throw new Error(
                "يجب تشغيل زر PayPal داخل متجر Shopify."
              );
            }

            const root = window.Shopify.routes.root;

            const cartResponse = await fetch(`${root}cart.js`, {
              method: "GET",
              credentials: "same-origin",
              headers: {
                Accept: "application/json",
              },
            });

            if (!cartResponse.ok) {
              throw new Error("تعذر قراءة سلة Shopify.");
            }

            const currentCart: ShopifyCart =
              await cartResponse.json();

            if (
              !currentCart.items ||
              currentCart.items.length === 0
            ) {
              throw new Error("السلة فارغة.");
            }

            /*
             * Send line information to our secure Vercel server.
             *
             * IMPORTANT:
             * The server must validate the final amount before
             * creating the PayPal order.
             */
            const response = await fetch(
              "https://solvexa-paypal.vercel.app/api/paypal/create-order",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  currency: currentCart.currency,

                  cart: currentCart.items.map((item) => ({
                    variant_id: item.variant_id,
                    product_id: item.product_id,
                    title: item.product_title || item.title,
                    sku: item.sku || "",
                    quantity: item.quantity,
                    price: item.final_price,
                    line_price: item.final_line_price,
                  })),

                  /*
                   * Sent for the current prototype.
                   * The server still validates that it is positive.
                   */
                  total: (
                    currentCart.total_price / 100
                  ).toFixed(2),
                }),
              }
            );

            const data = await response.json();

            if (!response.ok) {
              console.error("Create order error:", data);

              throw new Error(
                data?.error ||
                  "فشل إنشاء طلب PayPal."
              );
            }

            if (!data.orderID) {
              throw new Error(
                "PayPal لم يرجع رقم الطلب."
              );
            }

            return data.orderID;
          },

          async onApprove(data: any) {
            try {
              const response = await fetch(
                "https://solvexa-paypal.vercel.app/api/paypal/capture-order",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    orderID: data.orderID,
                  }),
                }
              );

              const result = await response.json();

              if (!response.ok || !result.success) {
                console.error(
                  "Capture error:",
                  result
                );

                alert(
                  "تمت الموافقة على الدفع ولكن حدث خطأ أثناء تأكيد العملية."
                );

                return;
              }

              /*
               * Payment was captured successfully.
               *
               * NOTE:
               * This does NOT yet create a paid Shopify order.
               * That requires a proper Shopify order/payment
               * synchronization step.
               */
              alert("تم الدفع بنجاح ✅");

              console.log(
                "PayPal capture:",
                result
              );
            } catch (err) {
              console.error(err);

              alert(
                "حدث خطأ أثناء تأكيد الدفع."
              );
            }
          },

          onCancel() {
            console.log(
              "تم إلغاء عملية الدفع."
            );
          },

          onError(error: any) {
            console.error(
              "PayPal Error:",
              error
            );

            setError(
              "حدث خطأ أثناء الدفع عبر PayPal."
            );
          },
        })
        .render("#paypal-button-container");
    };

    const loadPayPal = async () => {
      try {
        await getShopifyCart();

        if (
          document.getElementById("paypal-sdk")
        ) {
          if (window.paypal) {
            renderPayPal();
            setLoading(false);
          }

          return;
        }

        const script =
          document.createElement("script");

        script.id = "paypal-sdk";

        script.src =
          `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}` +
          `&currency=USD&components=buttons,card-fields`;

        script.async = true;

        script.onload = () => {
          setLoading(false);
          renderPayPal();
        };

        script.onerror = () => {
          setError(
            "تعذر تحميل PayPal."
          );

          setLoading(false);
        };

        document.body.appendChild(script);
      } catch (err) {
        console.error(err);

        setError(
          "حدث خطأ أثناء تشغيل PayPal."
        );

        setLoading(false);
      }
    };

    loadPayPal();

    return () => {
      mounted = false;
    };
  }, []);

  const cartTotal =
    cart && cart.total_price
      ? (cart.total_price / 100).toFixed(2)
      : "0.00";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "30px",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "500px",
          background: "#fff",
          padding: "30px",
          borderRadius: "16px",
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            marginBottom: "10px",
          }}
        >
          SOLVEXA
        </h1>

        <p
          style={{
            marginBottom: "20px",
          }}
        >
          Pay securely with PayPal
        </p>

        {cartLoading && (
          <p style={{ marginBottom: "15px" }}>
            جاري قراءة السلة...
          </p>
        )}

        {cart && (
          <div
            style={{
              marginBottom: "20px",
              padding: "15px",
              background: "#f7f7f7",
              borderRadius: "10px",
            }}
          >
            <strong>
              المنتجات في السلة:{" "}
              {cart.items.length}
            </strong>

            <br />

            <strong>
              الإجمالي:{" "}
              {cartTotal}{" "}
              {cart.currency}
            </strong>
          </div>
        )}

        {loading && (
          <p style={{ marginBottom: "15px" }}>
            جاري تحميل PayPal...
          </p>
        )}

        {error && (
          <p
            style={{
              color: "red",
              marginBottom: "15px",
            }}
          >
            {error}
          </p>
        )}

        <div id="paypal-button-container" />
      </div>
    </main>
  );
}
```

