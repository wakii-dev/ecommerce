export interface paths {
    "/api/notification/emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Gửi email theo template (internal-only)
         * @description Chỉ service nội bộ gọi (qua network trust / service token — SF-3 wiring), KHÔNG
         *     route qua gateway công khai. Template là tên render nội bộ (vd `password-reset`,
         *     `order-confirmed`); `params` là biến render tự do theo template.
         *     `idempotencyKey` optional: cùng key → không gửi lại (tránh double-send khi retry).
         */
        post: operations["sendEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notification/admin/emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Log email (admin, debug dev)
         * @description Log gửi email để debug — Mailpit là UI xem nội dung thật trong dev; endpoint này
         *     phục vụ admin env production/staging. Phân trang 1-based.
         */
        get: operations["listEmails"];
        put?: never;
        post?: never;
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
        SendEmailRequest: {
            /**
             * Format: email
             * @description Địa chỉ người nhận
             */
            to: string;
            /** @description Tên template nội bộ (vd password-reset, order-confirmed, review-moderated) */
            template: string;
            /** @description Biến render theo template (payload tự do — mỗi template tự định nghĩa key) */
            params: {
                [key: string]: unknown;
            };
            /** @description Nếu trùng key đã xử lý → bỏ qua gửi lại, trả emailId cũ */
            idempotencyKey?: string;
        };
        EmailAccepted: {
            /** @description Id log email — tra cứu ở GET /admin/emails */
            emailId: string;
        };
        /** @enum {string} */
        EmailStatus: "SENT" | "FAILED";
        EmailLog: {
            id: string;
            /** Format: email */
            to: string;
            template: string;
            /** @description Subject đã render */
            subject: string;
            status: components["schemas"]["EmailStatus"];
            /** Format: date-time */
            sentAt: string;
            /** @description Lỗi SMTP khi FAILED */
            error?: string;
        };
        /** @description Page chuẩn {items, page, size, total} */
        EmailLogPage: {
            items: components["schemas"]["EmailLog"][];
            /** @description Trang hiện tại (1-based) */
            page: number;
            size: number;
            /** @description Tổng số item khớp filter */
            total: number;
        };
    };
    responses: never;
    parameters: {
        /** @description Số trang (1-based) */
        Page: number;
        /** @description Số item mỗi trang */
        Size: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    sendEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendEmailRequest"];
            };
        };
        responses: {
            /** @description Đã nhận — gửi async (SMTP sink dev là Mailpit) */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmailAccepted"];
                };
            };
            /** @description Payload không hợp lệ (to/email template sai) */
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
    listEmails: {
        parameters: {
            query?: {
                /** @description Số trang (1-based) */
                page?: components["parameters"]["Page"];
                /** @description Số item mỗi trang */
                size?: components["parameters"]["Size"];
                /** @description Lọc theo email người nhận (contains) */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page log email */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmailLogPage"];
                };
            };
            /** @description Tham số phân trang không hợp lệ */
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

