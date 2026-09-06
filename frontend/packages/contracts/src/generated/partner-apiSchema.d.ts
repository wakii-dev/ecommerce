export interface paths {
    "/open-api/v1/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sách product (dạng tóm tắt cho partner)
         * @description Phân trang 1-based; lọc theo category slug nếu cần.
         */
        get: operations["listPartnerProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/open-api/v1/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiết product (kèm description + variants)
         * @description Bổ sung mô tả và danh sách variant so với bản tóm tắt.
         */
        get: operations["getPartnerProduct"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/open-api/v1/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cây category dạng phẳng (parentId tự dựng cây)
         * @description Trả danh sách phẳng; partner tự dựng cây qua parentId (null = gốc).
         */
        get: operations["listPartnerCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/open-api/v1/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tìm kiếm product theo từ khóa
         * @description Tìm trên tên + mô tả (full-text phía service); trả page rỗng khi không khớp.
         */
        get: operations["searchPartnerProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/open-api/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tạo đơn từ partner
         * @description `partnerRef` là id đơn bên hệ thống partner — idempotent THEO PARTNER: partner gửi
         *     lại cùng partnerRef → trả đơn đã có (không tạo trùng). Đơn vào pipeline ordering
         *     chuẩn; trạng thái trả về theo enum chung §3.6.
         */
        post: operations["createPartnerOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/open-api/v1/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tra cứu đơn đã tạo
         * @description Chỉ thấy đơn của API key mình; đổi trạng thái partner nhận qua webhook.
         */
        get: operations["getPartnerOrder"];
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
        /** @description Product dạng tóm tắt cho partner (giá bán VND) */
        PartnerProduct: {
            id: string;
            sku?: string;
            slug: string;
            name: string;
            /** @description Giá VND nguyên */
            price: number;
            /** @description Tồn khả dụng — chỉ hiện khi bật expose-stock cho key */
            stock?: number;
            /** Format: date-time */
            updatedAt: string;
        };
        PartnerVariant: {
            id: string;
            /** @description Tên variant đã resolve (vd "Đỏ / 256GB") */
            name: string;
            /** @description Giá VND của variant */
            price: number;
            stock?: number;
        };
        /** @description PartnerProduct + mô tả + variants */
        PartnerProductDetail: components["schemas"]["PartnerProduct"] & {
            description: string;
            variants: components["schemas"]["PartnerVariant"][];
        };
        /** @description Category phẳng — partner tự dựng cây qua parentId */
        PartnerCategory: {
            id: string;
            slug: string;
            name: string;
            /** @description null = category gốc */
            parentId?: string;
        };
        /** @description Người nhận do partner cung cấp */
        PartnerCustomer: {
            name: string;
            phone: string;
            /** Format: email */
            email?: string;
            address: string;
        };
        PartnerOrderItem: {
            productId: string;
            /** @description Bắt buộc với sản phẩm có variant */
            variantId?: string;
            qty: number;
        };
        CreatePartnerOrderRequest: {
            /** @description Id đơn bên partner — idempotent theo partner */
            partnerRef: string;
            customer: components["schemas"]["PartnerCustomer"];
            items: components["schemas"]["PartnerOrderItem"][];
        };
        /**
         * @description Trạng thái đơn — mirror enum ordering §3.6
         * @enum {string}
         */
        OrderStatus: "PENDING" | "PAID" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "FAILED";
        PartnerOrderCreated: {
            orderId: string;
            partnerRef: string;
            status: components["schemas"]["OrderStatus"];
        };
        PartnerOrderLine: {
            productId: string;
            variantId?: string;
            name?: string;
            qty: number;
            unitPrice?: number;
        };
        PartnerOrder: {
            orderId: string;
            partnerRef: string;
            status: components["schemas"]["OrderStatus"];
            items: components["schemas"]["PartnerOrderLine"][];
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Page chuẩn {items, page, size, total} */
        PartnerProductPage: {
            items: components["schemas"]["PartnerProduct"][];
            page: number;
            size: number;
            total: number;
        };
        /**
         * @description Webhook OUTBOUND service → partner (KHÔNG phải endpoint): push khi đơn partner đổi
         *     trạng thái. Header `X-Signature` = HMAC-SHA256(partnerSecret, rawBody); partner
         *     verify trước khi tin body. Sai serial/retry với backoff; quá hạn → DLQ.
         */
        PartnerOrderChangedEvent: {
            /**
             * Format: uuid
             * @description Id dùng để partner dedupe (idempotent nhận webhook)
             */
            eventId: string;
            orderId: string;
            partnerRef: string;
            status: components["schemas"]["OrderStatus"];
            /** Format: date-time */
            occurredAt: string;
        };
    };
    responses: {
        /** @description API key sai hoặc hết hạn */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Vượt rate-limit của key */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
    };
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
    listPartnerProducts: {
        parameters: {
            query?: {
                /** @description Số trang (1-based) */
                page?: components["parameters"]["Page"];
                /** @description Số item mỗi trang */
                size?: components["parameters"]["Size"];
                /** @description Lọc theo category slug */
                category?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page product */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerProductPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
        };
    };
    getPartnerProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Chi tiết product */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerProductDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Không tìm thấy product */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            429: components["responses"]["RateLimited"];
        };
    };
    listPartnerCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Danh sách category phẳng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerCategory"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
        };
    };
    searchPartnerProducts: {
        parameters: {
            query: {
                /** @description Từ khóa tìm kiếm */
                q: string;
                /** @description Số trang (1-based) */
                page?: components["parameters"]["Page"];
                /** @description Số item mỗi trang */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page kết quả */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerProductPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
        };
    };
    createPartnerOrder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePartnerOrderRequest"];
            };
        };
        responses: {
            /** @description Đơn đã tạo (hoặc replay của partnerRef cũ) */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerOrderCreated"];
                };
            };
            /** @description Payload không hợp lệ (items rỗng / address thiếu) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Sản phẩm/variant hết hàng hoặc ngừng bán */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            429: components["responses"]["RateLimited"];
        };
    };
    getPartnerOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description orderId trả về lúc tạo đơn */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trạng thái đơn */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerOrder"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Không tìm thấy đơn (hoặc không thuộc partner key này) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            429: components["responses"]["RateLimited"];
        };
    };
}

