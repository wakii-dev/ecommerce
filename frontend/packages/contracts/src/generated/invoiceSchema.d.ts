export interface paths {
    "/api/invoice/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Render hóa đơn PDF từ payload hoàn chỉnh
         * @description Body chứa toàn bộ dữ liệu hóa đơn ĐÃ tính (breakdown VAT-inclusive do caller lo).
         *     Trả PDF binary. Renderer lỗi (template/render crash) → 503 problem+json — caller
         *     xử lý degraded rõ ràng (không tự sinh PDF thay thế).
         */
        post: operations["generateInvoice"];
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
        /** @description Dòng hóa đơn — giá trị đã tính VAT-inclusive từ caller */
        InvoiceItem: {
            /** @description Tên dòng hàng đã resolve theo locale đặt đơn */
            name: string;
            qty: number;
            /** @description Đơn giá VND (đã tính phần VAT thuộc dòng) */
            unitPrice: number;
            /** @description Thành tiền dòng VND = qty x unitPrice */
            lineTotal: number;
        };
        InvoicePayload: {
            order: {
                /** @description Order id tham chiếu */
                id: string;
                /** @description Mã đơn hiển thị (nếu khác id) */
                number?: string;
                /** Format: date-time */
                createdAt: string;
                items: components["schemas"]["InvoiceItem"][];
            };
            seller: {
                name: string;
                address: string;
                phone?: string;
                /** @description MST người bán — e-invoice VN (R2 FI-312 P2; SF-13 invoice polish sẽ dùng) */
                taxId?: string;
            };
            buyer: {
                name: string;
                /** @description Mã số thuế (khách doanh nghiệp) — optional */
                taxId?: string;
                address: string;
                phone?: string;
            };
            /** @description Thông tin hóa đơn — số + template do caller cung cấp */
            invoice: {
                /** @description Ký hiệu mẫu hóa đơn */
                templateSymbol: string;
                /** @description Ký hiệu série hóa đơn */
                seriesSymbol: string;
                /** @description Số hóa đơn tuần tự do caller cấp */
                number: number;
                /** @description Thuế suất % (env INVOICE_VAT_RATE=10) — caller truyền để in lên hóa đơn */
                vatRate: number;
                /** @description Tổng tiền hóa đơn VND (đã gồm VAT) */
                totalAmount: number;
                note?: string;
            };
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
    generateInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoicePayload"];
            };
        };
        responses: {
            /** @description PDF hóa đơn */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/pdf": string;
                };
            };
            /** @description Payload thiếu trường bắt buộc (validate bằng pydantic) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Renderer lỗi — service degraded (D18) */
            503: {
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

