export interface paths {
    "/api/ordering/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tao don hang
         * @description Header `Idempotency-Key` BẮT BUỘC (uuid do client sinh):
         *     - Trung key + CUNG payload → tra lai don cu (idempotent).
         *     - Trung key + KHAC payload → 409.
         *     Luat nghiep vu:
         *     - COD (D21): `clientSecret` = null — saga bo buoc intent, don CONFIRMED
         *       ngay sau reserve inventory; PAID khi admin giao hang.
         *     - Stripe: tra `clientSecret` de FE confirm payment (zero-decimal VND).
         *     - Diem thuong: `usePoints` (so diem dung) → `pointsDiscount` tren Order.
         *     Loi: 409 het ton kho (`insufficient[]` structured — CreateOrderConflictError), 422 coupon khong hop le.
         */
        post: operations["createOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/orders/validate-coupon": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kiem tra coupon truoc khi dat (khong reserve)
         * @description FE goi realtime khi nhap ma. Khong tac dong ton kho/usage.
         */
        post: operations["validateCoupon"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/coupons/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach coupon active (coupon center)
         * @description Chi coupon dang chay. KHONG lo usage-limit/used-count noi bo.
         *     `type` PERCENT → value la %; FIXED → value la so VND.
         */
        get: operations["listPublicCoupons"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach don cua toi
         * @description Tra OrderSummary (khong items) — moi nhat truoc.
         */
        get: operations["listMyOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiet don cua toi
         * @description Chi don cua chinh user — cua nguoi khac → 404.
         */
        get: operations["getMyOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Huy don cua toi
         * @description User tu huy khi don con PENDING (chua tra tien).
         *     Trạng thái khac → 409 (quy tren state machine §3.6).
         */
        post: operations["cancelMyOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/orders/{id}/invoice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tai hoa don PDF (D18)
         * @description 409 khi don chua CONFIRMED. PDF binary — so hoa don tuan tu.
         */
        get: operations["getMyOrderInvoice"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/orders/{id}/tracking": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tracking van chuyen
         * @description Du lieu tu shippingMethod hien tai (MVP flat-fee; GHN SF-14 cung shape).
         */
        get: operations["getMyOrderTracking"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/me/rma": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach RMA cua toi
         * @description Moi nhat truoc, kem status lifecycle.
         */
        get: operations["listMyRmas"];
        put?: never;
        /**
         * Tao yeu cau tra/doi hang (D22)
         * @description Cua so RMA: 7 ngay ke tu DELIVERED — qua han → 409.
         *     `lines[].lineId` la id cua OrderLine trong don.
         */
        post: operations["createRma"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/shipping/methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cac phuong thuc van chuyen
         * @description MVP flat-fee (fee VND, etaDays du kien). GHN SF-14 cung shape.
         */
        get: operations["listShippingMethods"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach don (admin)
         * @description Can role ADMIN. Loc theo status, tim q (id/email/ten).
         */
        get: operations["adminListOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiet don (admin)
         * @description Day du items + timeline + address.
         */
        get: operations["adminGetOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders/{id}/ship": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Danh dau da giao hang cho carrier (admin)
         * @description CONFIRMED → SHIPPED (§3.6). Gan trackingCode khi ship.
         */
        post: operations["adminShipOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders/{id}/deliver": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Danh dau da giao thanh cong (admin)
         * @description SHIPPED → DELIVERED (§3.6). Don COD luc nay tra PAID.
         */
        post: operations["adminDeliverOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Huy don (admin)
         * @description §3.6 — PENDING/PAID/CONFIRMED → CANCELLED. Huy sau PAID tu dong refund
         *     (server lo hoan tien qua payment-service, admin khong goi refund rieng).
         */
        post: operations["adminCancelOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/orders/{id}/invoice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tai hoa don PDF cua don bat ky (admin, D18)
         * @description Cung rang buoc CONFIRMED nhu ben customer.
         */
        get: operations["adminGetOrderInvoice"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/rma": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach RMA (admin)
         * @description Loc theo status (REQUESTED/APPROVED/RECEIVED/REFUNDED/REJECTED).
         */
        get: operations["adminListRmas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/rma/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Chap nhan RMA (admin)
         * @description REQUESTED → APPROVED (cho khong gui hang ve).
         */
        post: operations["adminApproveRma"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/rma/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tu choi RMA (admin)
         * @description REQUESTED → REJECTED (terminal).
         */
        post: operations["adminRejectRma"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/rma/{id}/mark-received": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Xac nhan da nhan hang tra ve (admin)
         * @description APPROVED → RECEIVED.
         */
        post: operations["adminMarkRmaReceived"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/rma/{id}/refund": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Hoan tien RMA (admin)
         * @description RECEIVED → REFUNDED (terminal) — server goi payment-service refund.
         */
        post: operations["adminRefundRma"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/stats/revenue-by-day": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Doanh thu theo ngay (§6.1.8)
         * @description Tu ngay `from` den `to` (yyyy-mm-dd, inclusive).
         */
        get: operations["adminRevenueByDay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/stats/orders-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tong quan don hang cho dashboard (§6.1.8)
         * @description Counts tung status + totalRevenue/todayRevenue/todayOrders.
         */
        get: operations["adminOrdersSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ordering/admin/stats/top-products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Top san pham ban chay (§6.1.8)
         * @description Mac dinh 10 item, loc theo khoang thoi gian from/to.
         */
        get: operations["adminTopProducts"];
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
        InsufficientStock: {
            variantId: string;
            requested: number;
            /** @description Ton kho co the mua (da tru reserved). */
            available: number;
        };
        /**
         * @description Body 409 cua POST /orders — mirror ReservationConflictError cua inventory.yaml
         *     (all-or-nothing). Replay Idempotency-Key khac payload cung tra 409 nhung
         *     KHONG co `insufficient` (vi vay field nay khong required).
         */
        CreateOrderConflictError: components["schemas"]["ApiError"] & {
            /** @description Cac variant thieu hang (chi co khi 409 do het stock). */
            insufficient?: components["schemas"]["InsufficientStock"][];
        };
        /**
         * @description State machine don hang — pin §3.6. Transitions hop le:
         *
         *     | From      | To        | Ai                                 |
         *     |-----------|-----------|------------------------------------|
         *     | PENDING   | PAID      | system (payment webhook)           |
         *     | PAID      | CONFIRMED | system                             |
         *     | CONFIRMED | SHIPPED   | admin (POST .../ship)              |
         *     | SHIPPED   | DELIVERED | admin (POST .../deliver); COD→PAID |
         *     | PENDING   | CANCELLED | admin, USER (POST .../cancel), hoac SYSTEM TTL 30' |
         *     | PAID / CONFIRMED | CANCELLED | admin (+ refund tu dong) |
         *     | PENDING   | FAILED    | system                             |
         *
         *     Admin KHONG co endpoint confirm — CONFIRMED chi den tu PAID, tu dong.
         * @enum {string}
         */
        OrderStatus: "PENDING" | "PAID" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "FAILED";
        Address: {
            fullName: string;
            phone: string;
            /** @description So nha + duong. */
            line1: string;
            ward: string;
            district: string;
            city: string;
            postalCode?: string;
        };
        OrderLine: {
            /** @description Id dong hang — client dung de tao RMA (lineId). */
            id: string;
            productId: string;
            /** @description Level variant (pin §6.1). */
            variantId: string;
            /** @description Ten DA resolve (vi) tai thoi diem dat. */
            name: string;
            image?: string;
            qty: number;
            /** @description Don gia snapshot (VND). */
            unitPrice: number;
            /** @description qty × unitPrice (VND). */
            lineTotal: number;
        };
        Order: {
            id: string;
            userId: string;
            status: components["schemas"]["OrderStatus"];
            items: components["schemas"]["OrderLine"][];
            /** @description Tong hang hoa (VND). */
            subtotal: number;
            /** @description Giam gia coupon (VND). */
            discount: number;
            /** @description Phi van chuyen (VND). */
            shippingFee: number;
            /** @description So tien duoc giam tu diem thuong (VND) — neu co. */
            pointsDiscount?: number;
            /** @description subtotal - discount - pointsDiscount + shippingFee (VND). */
            total: number;
            /** @enum {string} */
            currency: "VND";
            couponCode?: string;
            affiliateCode?: string;
            /**
             * @description COD (D21) — CONFIRMED sau reserve, PAID khi giao.
             * @enum {string}
             */
            paymentMethod: "stripe" | "cod";
            /** @description Id phuong thuc (tu GET /shipping/methods). */
            shippingMethod: string;
            trackingCode?: string;
            address: components["schemas"]["Address"];
            /** @description Lich su chuyen trang thai (thu tu thoi gian). */
            timeline: {
                status: components["schemas"]["OrderStatus"];
                /** Format: date-time */
                at: string;
            }[];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Dong danh sach — khong items, co itemsCount + paymentMethod. */
        OrderSummary: {
            id: string;
            userId: string;
            status: components["schemas"]["OrderStatus"];
            /** @description Tong so san pham (cong qty). */
            itemsCount: number;
            subtotal: number;
            discount: number;
            shippingFee: number;
            pointsDiscount?: number;
            total: number;
            /** @enum {string} */
            currency: "VND";
            couponCode?: string;
            /** @enum {string} */
            paymentMethod: "stripe" | "cod";
            shippingMethod: string;
            trackingCode?: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CreateOrderItem: {
            productId: string;
            variantId: string;
            qty: number;
        };
        CreateOrderRequest: {
            items: components["schemas"]["CreateOrderItem"][];
            couponCode?: string;
            /** @description So diem thuong muon dung (loyalty — D22). */
            usePoints?: number;
            /**
             * @description D21 — mac dinh stripe; COD bo buoc intent.
             * @default stripe
             * @enum {string}
             */
            paymentMethod: "stripe" | "cod";
            /** @description Id tu GET /api/ordering/shipping/methods. */
            shippingMethod: string;
            affiliateCode?: string;
            address: components["schemas"]["Address"];
        };
        CreateOrderResponse: {
            order: components["schemas"]["Order"];
            /**
             * @description Stripe clientSecret de FE confirm payment. NULL khi COD
             *     (saga bo buoc intent — D21).
             */
            clientSecret: string | null;
        };
        OrderPage: {
            items: components["schemas"]["Order"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        OrderSummaryPage: {
            items: components["schemas"]["OrderSummary"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        ValidateCouponRequest: {
            code: string;
            /** @description Tong hang hoa hien tai de tinh discount (VND). */
            subtotal: number;
        };
        ValidateCouponResponse: {
            valid: boolean;
            /** @description So tien giam duoc (VND) — 0 khi invalid. */
            discount: number;
            /** @description Ly do khi invalid (vd "Don toi thieu 500.000d"). */
            message?: string;
        };
        /** @description Coupon cho coupon center — KHONG lo usage-limit/used-count noi bo. */
        PublicCoupon: {
            code: string;
            /**
             * @description PERCENT → value la %; FIXED → value la so VND.
             * @enum {string}
             */
            type: "PERCENT" | "FIXED";
            value: number;
            /** @description Don toi thieu (VND) — neu co. */
            minOrderValue?: number;
            /** Format: date-time */
            startsAt?: string;
            /** Format: date-time */
            endsAt?: string;
            description: string;
        };
        ShippingMethod: {
            id: string;
            name: string;
            /** @description Phi flat (VND) — MVP. */
            fee: number;
            /** @description Du kien so ngay giao. */
            etaDays: number;
        };
        TrackingEvent: {
            /** Format: date-time */
            at: string;
            description: string;
        };
        TrackingResponse: {
            trackingCode: string;
            /** @description Ten don vi van chuyen (MVP "flat" — SF-14 GHN). */
            carrier: string;
            /** @description Trang thai carrier (vd pending, in_transit, delivered). */
            status: string;
            events?: components["schemas"]["TrackingEvent"][];
        };
        /**
         * @description Lifecycle RMA (D22): REQUESTED → APPROVED → RECEIVED → REFUNDED,
         *     nhánh REJECTED tu REQUESTED (terminal). Cua so tao: 7 ngay ke tu
         *     khi don DELIVERED.
         * @enum {string}
         */
        RmaStatus: "REQUESTED" | "APPROVED" | "RECEIVED" | "REFUNDED" | "REJECTED";
        RmaLine: {
            /** @description Id OrderLine trong don. */
            lineId: string;
            qty: number;
        };
        Rma: {
            id: string;
            orderId: string;
            status: components["schemas"]["RmaStatus"];
            lines: components["schemas"]["RmaLine"][];
            reason: string;
            /** Format: date-time */
            createdAt: string;
        };
        RmaPage: {
            items: components["schemas"]["Rma"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        RmaCreateRequest: {
            orderId: string;
            lines: components["schemas"]["RmaLine"][];
            reason: string;
        };
        RevenueByDay: {
            /** Format: date */
            date: string;
            /** @description Doanh thu ngay (VND). */
            revenue: number;
            /** @description So don trong ngay. */
            orders: number;
        };
        /** @description Dem don theo tung status + doanh thu tong/quy (VND). */
        OrdersSummary: {
            pending: number;
            paid: number;
            confirmed: number;
            shipped: number;
            delivered: number;
            cancelled: number;
            failed: number;
            /** @description Tong doanh thu (don PAID+, VND). */
            totalRevenue: number;
            /** @description Doanh thu hom nay (VND). */
            todayRevenue: number;
            /** @description So don hom nay. */
            todayOrders: number;
        };
        TopProduct: {
            productId: string;
            name: string;
            /** @description Tong so luong ban. */
            qty: number;
            /** @description Tong doanh thu (VND). */
            revenue: number;
        };
    };
    responses: {
        /** @description Body/param khong hop le. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Chua xac thuc / token het han. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Khong du quyen (can role ADMIN). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Khong tim thay tai nguyen. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
    };
    parameters: {
        /** @description So trang — 1-based. */
        Page: number;
        /** @description So item moi trang (mac dinh 20, toi da 100). */
        Size: number;
        /**
         * @description BẮT BUỘC — uuid client sinh. Trung key + cung payload → tra don cu;
         *     trung key + khac payload → 409.
         */
        IdempotencyKey: string;
        /** @description Id don hang. */
        OrderIdPath: string;
        /** @description Id RMA. */
        RmaIdPath: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createOrder: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description BẮT BUỘC — uuid client sinh. Trung key + cung payload → tra don cu;
                 *     trung key + khac payload → 409.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrderRequest"];
            };
        };
        responses: {
            /** @description Da tao don. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateOrderResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            /**
             * @description Het ton kho (all-or-nothing — `insufficient[]` structured, mirror
             *     ReservationConflictError inventory.yaml), hoac trung Idempotency-Key
             *     khac payload (truong hop nay khong co `insufficient`).
             */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["CreateOrderConflictError"];
                };
            };
            /** @description Coupon khong hop le (het han / khong dat minOrderValue / sai code). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    validateCoupon: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ValidateCouponRequest"];
            };
        };
        responses: {
            /** @description Ket qua kiem tra (valid true/false — khong loi ra 4xx). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ValidateCouponResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    listPublicCoupons: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Coupon dang active. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicCoupon"][];
                };
            };
        };
    };
    listMyOrders: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang OrderSummary (khong items). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderSummaryPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getMyOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don hang day du. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    cancelMyOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don da CANCELLED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep huy (theo §3.6). */
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
    getMyOrderInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File PDF. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/pdf": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            /** @description Don chua CONFIRMED — chua co hoa don. */
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
    getMyOrderTracking: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang thai tracking. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    listMyRmas: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang RMA. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RmaPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    createRma: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RmaCreateRequest"];
            };
        };
        responses: {
            /** @description Da tao — dang REQUESTED, cho admin duyet. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Rma"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            /** @description Qua 7 ngay tu DELIVERED hoac don khong dung nguoi so huu. */
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
    listShippingMethods: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Danh sach phuong thuc. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShippingMethod"][];
                };
            };
        };
    };
    adminListOrders: {
        parameters: {
            query?: {
                status?: components["schemas"]["OrderStatus"];
                q?: string;
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang don hang. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminGetOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don hang day du. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminShipOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don da SHIPPED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep ship (§3.6). */
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
    adminDeliverOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don da DELIVERED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep deliver (§3.6). */
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
    adminCancelOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Don da CANCELLED (refunded=true neu co hoan tien). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep huy (vd SHIPPED/DELIVERED — theo §3.6). */
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
    adminGetOrderInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id don hang. */
                id: components["parameters"]["OrderIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File PDF. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/pdf": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Don chua CONFIRMED — chua co hoa don. */
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
    adminListRmas: {
        parameters: {
            query?: {
                status?: components["schemas"]["RmaStatus"];
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang RMA. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RmaPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminApproveRma: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id RMA. */
                id: components["parameters"]["RmaIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rma da APPROVED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Rma"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep. */
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
    adminRejectRma: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id RMA. */
                id: components["parameters"]["RmaIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rma da REJECTED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Rma"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep. */
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
    adminMarkRmaReceived: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id RMA. */
                id: components["parameters"]["RmaIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rma da RECEIVED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Rma"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep. */
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
    adminRefundRma: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id RMA. */
                id: components["parameters"]["RmaIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rma da REFUNDED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Rma"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Trang thai khong cho phep. */
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
    adminRevenueByDay: {
        parameters: {
            query: {
                from: string;
                to: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Chuoi doanh thu theo ngay (revenue VND). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevenueByDay"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminOrdersSummary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dem theo status + doanh thu. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrdersSummary"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminTopProducts: {
        parameters: {
            query?: {
                /** @description So luong (mac dinh 10). */
                limit?: number;
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Top san pham theo so luong ban. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopProduct"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}

