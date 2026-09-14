"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
  }
}

const PAYPAL_CLIENT_ID =
  "BAAYbwj3MQtsQAOsgglGMuJQ2gos-UyXudaAXhtKBJUzJJlzFCY6VZU_ZOkFE0GSqAoHjIlrkxt8nX0sG4";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPayPal = async () => {
      try {
        if (!document.getElementById("paypal-sdk")) {
          const script = document.createElement("script");

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
            setError("تعذر تحميل PayPal.");
            setLoading(false);
          };

          document.body.appendChild(script);
        } else {
          setLoading(false);
          renderPayPal();
        }
      } catch (err) {
        console.error(err);
        setError("حدث خطأ أثناء تشغيل PayPal.");
        setLoading(false);
      }
    };

    const renderPayPal = () => {
      if (!window.paypal) return;

      const container = document.getElementById(
        "paypal-button-container"
      );

      if (!container || container.children.length > 0) return;

      window.paypal
        .Buttons({
          style: {
            layout: "vertical",
            shape: "rect",
            label: "paypal",
          },

          async createOrder() {
            const response = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                currency: "USD",
              }),
            });

            if (!response.ok) {
              throw new Error("فشل إنشاء طلب PayPal");
            }

            const data = await response.json();

            return data.orderID;
          },

          async onApprove(data: any) {
            const response = await fetch(
              "/api/paypal/capture-order",
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

            if (result.success) {
              alert("تم الدفع بنجاح ✅");
            } else {
              alert("حدث خطأ أثناء تأكيد الدفع.");
            }
          },

          onCancel() {
            console.log("تم إلغاء الدفع");
          },

          onError(error: any) {
            console.error("PayPal Error:", error);
            setError("حدث خطأ في PayPal.");
          },
        })
        .render("#paypal-button-container");
    };

    loadPayPal();
  }, []);

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
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: "28px", marginBottom: "10px" }}>
          SOLVEXA
        </h1>

        <p style={{ marginBottom: "25px" }}>
          Pay securely with PayPal
        </p>

        {loading && <p>جاري تحميل PayPal...</p>}

        {error && (
          <p style={{ color: "red", marginBottom: "15px" }}>
            {error}
          </p>
        )}

        <div id="paypal-button-container" />
      </div>
    </main>
  );
}
