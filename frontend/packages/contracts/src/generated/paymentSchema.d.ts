export interface paths {
    "/api/payment/intents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tạo payment intent (Stripe, VND zero-decimal)
         * @description Ordering gọi ngay khi tạo order stripe. `idempotencyKey` bảo vệ retry: cùng key +
         *     cùng payload → trả lại kết quả cũ (idempotent replay); cùng key + payload khác → 409.
         */
        post: operations["createPaymentIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/payment/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Nhận webhook Stripe (raw event passthrough)
         * @description Body là raw Stripe event giữ nguyên như Stripe gửi (không parse/đổi shape ở edge).
         *     Verify chữ ký qua header `Stripe-Signature` trước khi xử lý; chữ ký sai → 400.
         */
        post: operations["handlePaymentWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/payment/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Hoàn tiền (full hoặc một phần)
         * @description Gọi khi admin cancel order đã PAID (refund tự động theo §3.6) hoặc RMA refund.
         *     Bỏ `amount` → refund toàn bộ. Ordering lo cập nhật state order; service này chỉ
         *     điều phối adapter và publish `payment.succeeded|failed`.
         */
        post: operations["createRefund"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/payment/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Void intent (hủy trước capture)
         * @description Chỉ void được intent chưa capture; đã succeeded → refund path thay thế.
         */
        post: operations["voidPayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/payment/cod/captures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Capture tiền COD lúc giao hàng (SF-13 A2)
         * @description Ordering gọi nội bộ khi deliver đơn COD (HTTP thẳng :8086, KHÔNG qua
         *     gateway — command edge §3.2). `idempotencyKey` bảo vệ retry: deliver
         *     retry cùng key → trả kết quả cũ với `replay=true`, không capture hai lần.
         */
        post: operations["captureCodPayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 7807 problem+json — mirror backend/shared/common-lib ApiError */
        ApiError: {
            /** @default about:blank */
            type: string;
            title?: string;
            status?: number;
            detail?: string;
            instance?: string;
            /** Format: date-time */
            timestamp?: string;
            requestId?: string;
            errors?: {
                field?: string;
                message?: string;
            }[];
        };
        CreateIntentRequest: {
            /** @description Order id bên ordering-service */
            orderId: string;
            /** @description Tổng tiền đơn vị VND nguyên (Stripe zero-decimal) — bằng order.total */
            amount: number;
            /** @enum {string} */
            currency: "VND";
            /** @description UUID do ordering sinh 1 lần cho mỗi lần tạo intent (retry dùng lại key cũ) */
            idempotencyKey: string;
        };
        /**
         * @description Mirror trạng thái Stripe PaymentIntent (uppercase)
         * @enum {string}
         */
        PaymentIntentStatus: "REQUIRES_PAYMENT_METHOD" | "REQUIRES_CONFIRMATION" | "PROCESSING" | "SUCCEEDED" | "CANCELED";
        PaymentIntentCreated: {
            /** @description pi_... của Stripe (adapter-generated) */
            paymentIntentId: string;
            /** @description FE dùng cho Stripe Elements confirm — order.created response nhả lại cho client */
            clientSecret: string;
            status: components["schemas"]["PaymentIntentStatus"];
        };
        /** @description Envelope event raw của Stripe — giữ nguyên shape Stripe gửi (passthrough) */
        StripeEvent: {
            /** @description evt_... Stripe */
            id: string;
            /** @description Luôn "event" theo Stripe */
            object?: string;
            api_version?: string;
            /** @description Unix timestamp giây */
            created?: number;
            /** @description vd payment_intent.succeeded, charge.refunded */
            type: string;
            /** @description Stripe data wrapper (object: payload thô) — raw, adapter tự parse */
            data?: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        WebhookAck: {
            /** @description Luôn true — ack nhận trước khi xử lý (idempotent theo event id Stripe) */
            received: boolean;
        };
        RefundRequest: {
            paymentIntentId: string;
            /** @description Số tiền refund đơn vị VND; bỏ trống = refund toàn bộ */
            amount?: number;
            /** @description duplicate | fraudulent | requested_by_customer | admin_cancel — tự do text, log lại */
            reason: string;
        };
        /**
         * @description Mirror trạng thái Stripe Refund (uppercase)
         * @enum {string}
         */
        RefundStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";
        RefundCreated: {
            /** @description re_... của Stripe */
            refundId: string;
            status: components["schemas"]["RefundStatus"];
            /** @description Số tiền thực refund (VND) */
            amount: number;
        };
        VoidRequest: {
            paymentIntentId: string;
        };
        VoidResult: {
            status: components["schemas"]["PaymentIntentStatus"];
        };
        /** @description Body capture tiền COD (SF-13 A2) — ordering gọi lúc deliver. */
        CodCaptureRequest: {
            /** @description Order id bên ordering-service */
            orderId: string;
            /** @description Số tiền thu COD (VND nguyên) */
            amountVnd: number;
            /** @description Key dedupe — cùng key → replay kết quả cũ */
            idempotencyKey: string;
        };
        CodCaptureResult: {
            /** @description Id payment intent COD nội bộ */
            paymentIntentId: string;
            /** @description Trạng thái sau capture (vd SUCCEEDED) */
            status: string;
            /** @description true khi đây là replay cùng idempotencyKey */
            replay: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createPaymentIntent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateIntentRequest"];
            };
        };
        responses: {
            /** @description Intent created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentIntentCreated"];
                };
            };
            /** @description Payload không hợp lệ */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description IdempotencyKey trùng nhưng payload khác, hoặc order đã có intent active */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    handlePaymentWebhook: {
        parameters: {
            query?: never;
            header: {
                /** @description Chữ ký HMAC từ Stripe (t=<ts>,v1=<sig>) */
                "Stripe-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StripeEvent"];
            };
        };
        responses: {
            /** @description Event nhận thành công (xử lý async sau ack) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookAck"];
                };
            };
            /** @description Chữ ký sai / payload không parse được */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createRefund: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefundRequest"];
            };
        };
        responses: {
            /** @description Refund created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundCreated"];
                };
            };
            /** @description Payload không hợp lệ */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description paymentIntentId không tồn tại */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Intent không refund được (chưa capture / tổng refund vượt amount) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    voidPayment: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoidRequest"];
            };
        };
        responses: {
            /** @description Voided */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VoidResult"];
                };
            };
            /** @description Payload không hợp lệ */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description paymentIntentId không tồn tại */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Intent đã capture / đã void — không void được nữa */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    captureCodPayment: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CodCaptureRequest"];
            };
        };
        responses: {
            /** @description Đã capture (replay=true khi retry cùng key). */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CodCaptureResult"];
                };
            };
            /** @description Payload không hợp lệ */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}

