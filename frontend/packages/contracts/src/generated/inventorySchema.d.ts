export interface paths {
    "/api/inventory/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tao reservation ton kho (variant level)
         * @description Goi boi ordering-service trong saga tao don (buoc reserve).
         *     ALL-OR-NOTHING: neu BAT KY variant nao thieu hang → KHONG reserve gi het,
         *     tra 409 voi `insufficient[]` (variantId/requested/available).
         *     Reservation tu het han sau `ttlMinutes` (mac dinh 30 — khop TTL 30' cua don PENDING §3.6).
         *     Thanh cong → publish event `inventory.reserved`.
         */
        post: operations["createReservation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/inventory/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ton kho kha dung theo danh sach variant
         * @description `variantIds` truyen cach nhau dau phay (form, explode=false):
         *     `?variantIds=a,b,c`. Tra `available` (khach co the mua) va `reserved`
         *     (dang bi giu boi cac reservation con hieu luc).
         */
        get: operations["getAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/inventory/admin/low-stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach variant sap het hang
         * @description Cho dashboard admin (bang low-stock). `threshold` mac dinh 10 —
         *     tra cac variant co `available` ≤ threshold.
         */
        get: operations["listLowStock"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/inventory/admin/stocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Upsert ton kho theo variant (admin, FI-397)
         * @description Form admin goi NGAY SAU save product cho tung variant — catalog admin
         *     PUT variants KHONG sync stock (inventory so huu ton kho, writer-supply).
         *     quantity 0 hop le (chot het hang).
         */
        put: operations["setStock"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/inventory/admin/stocks/{variantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Doc ton kho 1 variant (admin)
         * @description Form admin dung sau save de confirm.
         */
        get: operations["getStock"];
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
        ReservationItem: {
            /** @description Level variant (pin §6.1.4). */
            variantId: string;
            qty: number;
        };
        CreateReservationRequest: {
            /** @description Don hang gan voi reservation (idempotency theo order). */
            orderId: string;
            items: components["schemas"]["ReservationItem"][];
            /**
             * @description Het han tu dong — mac dinh 30 (khop TTL don PENDING §3.6).
             * @default 30
             */
            ttlMinutes: number;
        };
        ReservationCreated: {
            reservationId: string;
            /**
             * Format: date-time
             * @description Sau thoi diem nay reservation tu dong release.
             */
            expiresAt: string;
        };
        /** @description 1 variant thieu hang trong 409. */
        InsufficientStock: {
            variantId: string;
            /** @description So luong khach yeu cau. */
            requested: number;
            /** @description So luong thuc te kha dung. */
            available: number;
        };
        /** @description Body 409 — ApiError chuan + danh sach variant thieu hang (all-or-nothing). */
        ReservationConflictError: components["schemas"]["ApiError"] & {
            insufficient: components["schemas"]["InsufficientStock"][];
        };
        VariantAvailability: {
            variantId: string;
            /** @description Khach co the mua (da tru reserved). */
            available: number;
            /** @description Dang bi giu boi reservation con hieu luc. */
            reserved: number;
        };
        LowStockItem: {
            variantId: string;
            productId: string;
            /** @description Ten san pham (resolve vi) de hien bang dashboard. */
            productName: string;
            available: number;
            /** @description Nguong da ap dung cho dong nay. */
            threshold: number;
        };
        /** @description Body PUT /admin/stocks (FI-397) — upsert theo variant. */
        SetStockRequest: {
            variantId: string;
            /** @description So luong moi (0 = chot het hang). */
            quantity: number;
            /** @description Denormalized nullable — writer-supply (FI-310). */
            productId?: string;
            productName?: string;
        };
        /** @description Row ton kho theo variant (pin §6.1.4). */
        Stock: {
            variantId: string;
            /** @description Ton kha dung (available). */
            quantity: number;
            /** @description Nguong canh bao ton kho thap. */
            thresholdLow: number;
            productId?: string | null;
            productName?: string | null;
            /** Format: date-time */
            updatedAt: string;
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
        /** @description Thieu/JWT khong hop le. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description JWT hop le nhung khong du quyen (yeu cau role=admin). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createReservation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateReservationRequest"];
            };
        };
        responses: {
            /** @description Da reserve — dung truoc expiresAt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReservationCreated"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description Thieu hang (all-or-nothing) — body ApiError + insufficient[]. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ReservationConflictError"];
                };
            };
        };
    };
    getAvailability: {
        parameters: {
            query: {
                /** @description Danh sach variantId, phan cach phay. */
                variantIds: string[];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Availability tung variant (chi tra nhung variant ton tai). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VariantAvailability"][];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    listLowStock: {
        parameters: {
            query?: {
                /** @description Nguong canh bao (mac dinh 10). */
                threshold?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Danh sach variant ton kho thap. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LowStockItem"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    setStock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetStockRequest"];
            };
        };
        responses: {
            /** @description Stock row sau upsert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stock"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getStock: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                variantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stock row cua variant. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stock"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /** @description Khong co stock row cho variant. */
            404: {
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

