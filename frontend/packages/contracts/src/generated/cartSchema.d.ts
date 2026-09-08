export interface paths {
    "/api/cart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Xem gio hang hien tai
         * @description Guest qua cookie `cart_token`, user qua JWT — cung response shape.
         *     Moi GET deu enrich lai tung item (unavailable khi san pham xoa/het hang).
         */
        get: operations["getCart"];
        put?: never;
        /**
         * Tao gio hang guest
         * @description Guest chua co gio — goi de tao moi (khong body). Server tra Cart +
         *     Set-Cookie `cart_token` (httpOnly). Lan sau guest gui ngam cookie nay.
         */
        post: operations["createCart"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cart/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Them san pham vao gio
         * @description Them variant vao gio (da co thi cong qty). Server enrich gia/ten tu
         *     catalog va kiem tra ton kho. Response la Cart moi nhat (enrich).
         */
        post: operations["addCartItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cart/items/{itemId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Xoa 1 item khoi gio
         * @description Tra ve Cart moi nhat sau khi xoa (chu khong phai 204 rong).
         */
        delete: operations["removeCartItem"];
        options?: never;
        head?: never;
        /**
         * Doi so luong 1 item
         * @description qty phai ≥ 1 (muon xoa thi DELETE). Response Cart moi nhat.
         */
        patch: operations["updateCartItem"];
        trace?: never;
    };
    "/api/cart/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge gio guest vao gio user (JWT)
         * @description Can JWT. Body la `cartToken` cua gio guest. Gop vao gio cua user:
         *     dedupe theo variantId (cong qty), cap nhat gia tu catalog.
         *     Sau merge, cookie guest het hieu.
         */
        post: operations["mergeCart"];
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
        /** @description 1 dong hang — gia/ten la snapshot enrich tu catalog tai thoi diem GET. */
        CartItem: {
            /** @description Id dong hang trong gio (dung cho PATCH/DELETE). */
            id: string;
            productId: string;
            /** @description Level variant (pin §6.1). */
            variantId?: string;
            /** @description Slug san pham (resolve vi) de link sang PDP. */
            slug: string;
            /** @description Ten san pham DA resolve (vi). */
            name: string;
            /** @description URL anh dai dien (co the rong). */
            image?: string;
            qty: number;
            /** @description Don gia hien tai (VND). */
            unitPrice: number;
            /** @description qty × unitPrice (VND). */
            lineTotal: number;
            /**
             * @description Enrich tai GET — true khi san pham da xoa / variant het hang
             *     (spec §6.1.2). Item van hien trong gio nhung checkout se chan.
             */
            unavailable: boolean;
        };
        Cart: {
            /** @description Chi co voi gio guest (user JWT khong can). */
            cartToken?: string;
            items: components["schemas"]["CartItem"][];
            /** @description Tong cac lineTotal (VND) — tinh tren item khong unavailable. */
            subtotal: number;
        };
        AddItemRequest: {
            productId: string;
            /** @description Bat buoc khi product co variant; OMIT khi product khong-variant (amendment A1 — GAP#5 FI-310). Line identity = productId + variantId. */
            variantId?: string;
            /** @default 1 */
            qty: number;
            /**
             * @description Cho phep them du san pham het hang (hien "pre-order" trong gio).
             *     Mac dinh false — het hang se 409.
             * @default false
             */
            allowOos: boolean;
        };
        UpdateItemRequest: {
            qty: number;
        };
        MergeCartRequest: {
            /** @description Token gio guest (tu cookie truoc khi login). */
            cartToken: string;
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
        /** @description Khong tim thay item. */
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
        /** @description Id item trong gio (khong phai productId). */
        ItemIdPath: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getCart: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Gio hang (co the rong — items []). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description Guest chua co gio (khong co/cookie cart_token sai). */
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
    createCart: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Gio hang moi da tao + cookie cart_token. */
            201: {
                headers: {
                    /** @description cart_token=...; HttpOnly; SameSite=Lax */
                    "Set-Cookie": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    addCartItem: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddItemRequest"];
            };
        };
        responses: {
            /** @description Gio hang sau khi them. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description San pham / variant khong ton tai. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /**
             * @description Variant het hang. ApiError.detail dien ro variant nao het hang.
             *     Chi bo qua khi request co `allowOos=true` (them duong — khong giam hang).
             */
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
    removeCartItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id item trong gio (khong phai productId). */
                itemId: components["parameters"]["ItemIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Gio hang sau khi xoa. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    updateCartItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id item trong gio (khong phai productId). */
                itemId: components["parameters"]["ItemIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateItemRequest"];
            };
        };
        responses: {
            /** @description Gio hang sau khi cap nhat. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            /** @description So luong vuot ton kho. */
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
    mergeCart: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MergeCartRequest"];
            };
        };
        responses: {
            /** @description Gio hang da merge cua user. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            /** @description Gio guest khong ton tai (cartToken sai/het han). */
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

