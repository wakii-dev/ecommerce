export interface paths {
    "/api/catalog/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach san pham (PLP)
         * @description Content i18n resolve theo locale. Loc + sap xep + phan trang.
         */
        get: operations["listProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/products/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiet san pham theo slug (PDP)
         * @description Slug theo locale hien tai (vi hoac en deu khop). Content resolve theo locale.
         */
        get: operations["getProduct"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/products/{slug}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach review cua san pham
         * @description UGC khong i18n. Kem rating breakdown ("5".."1" → so luong).
         */
        get: operations["listProductReviews"];
        put?: never;
        /**
         * Gui review (chi user mua hang)
         * @description Can JWT. Review vao trang thai PENDING — hien thi sau khi admin duyet.
         *     UGC khong i18n.
         */
        post: operations["submitProductReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/products/{slug}/stock-alert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dang ky nhan bao khi co hang (D22)
         * @description Public (khong can JWT). Gui email cho user khi variant nhap hang lai.
         */
        post: operations["createStockAlert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cay danh muc
         * @description Tra cay day du (children de quy). Ten/slug resolve theo locale.
         */
        get: operations["getCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tim kiem san pham
         * @description Full-text (ES). Content resolve theo locale.
         */
        get: operations["searchProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/search/suggest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Goi y tim kiem (search-as-you-type)
         * @description Tra toi da 5 san pham + 5 danh muc.
         */
        get: operations["suggestProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/me/wishlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach wishlist (JWT)
         * @description Page ProductCard (content resolve theo locale, mac dinh vi).
         */
        get: operations["getWishlist"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/me/wishlist/ids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi ids san pham trong wishlist (JWT)
         * @description Nhe — de client check nhanh san pham da yeu thich chua.
         */
        get: operations["getWishlistIds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/me/wishlist/{productId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Them san pham vao wishlist (JWT)
         * @description Idempotent — them san pham da co khong loi.
         */
        put: operations["addWishlistItem"];
        post?: never;
        /**
         * Xoa san pham khoi wishlist (JWT)
         * @description Xoa thanh cong van tra 204 ke ca khi san pham khong co trong wishlist.
         */
        delete: operations["removeWishlistItem"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach san pham (admin)
         * @description Can role ADMIN. Tim kiem theo q + loc status.
         */
        get: operations["adminListProducts"];
        put?: never;
        /**
         * Tao san pham (admin)
         * @description Nhan ProductWrite — truong i18n dang object {vi, en}.
         */
        post: operations["adminCreateProduct"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiet san pham (admin) — full i18n
         * @description Tra full object goc (nameI18n...) dung de edit o admin console.
         */
        get: operations["adminGetProduct"];
        /**
         * Cap nhat san pham (admin) — full i18n
         * @description PUT thay the tron ven (gui lai full object nhu GET).
         */
        put: operations["adminUpdateProduct"];
        post?: never;
        /**
         * Xoa san pham (admin)
         * @description Soft-delete (khong con o FE). Order/review cu giu nguyen du lieu phan anh.
         */
        delete: operations["adminDeleteProduct"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cay danh muc (admin) — kem i18n goc
         * @description Giong GET cong khai nhung children mang them nameI18n/slugVi.
         */
        get: operations["adminListCategories"];
        put?: never;
        /**
         * Tao danh muc (admin)
         * @description Nhan CategoryWrite (i18n + parentId). Slug vi/en phai duy nhat.
         */
        post: operations["adminCreateCategory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chi tiet danh muc (admin) — full i18n
         * @description Tra CategoryAdmin (i18n goc) de edit.
         */
        get: operations["adminGetCategory"];
        /**
         * Cap nhat danh muc (admin) — full i18n
         * @description PUT thay the tron ven — gui lai object nhan tu GET.
         */
        put: operations["adminUpdateCategory"];
        post?: never;
        /**
         * Xoa danh muc (admin)
         * @description Chi xoa duoc khi khong co san pham va khong con children.
         */
        delete: operations["adminDeleteCategory"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Hang doi duyet review (admin)
         * @description Loc theo status (mac dinh PENDING). UGC khong i18n.
         */
        get: operations["adminListReviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/reviews/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Duyet review (admin)
         * @description Duyet xong publish + publish event review.moderated (denormalize rating_avg).
         */
        post: operations["adminApproveReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/reviews/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tu choi review (admin)
         * @description Publish event review.moderated (status REJECTED).
         */
        post: operations["adminRejectReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog/admin/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upload anh san pham (admin, D21)
         * @description Multipart field `image`. Gioi han 5MB/anh, chi jpg/png/webp.
         *     Luu MinIO, tra URL public `/media/**` phat qua gateway.
         */
        post: operations["uploadAdminImage"];
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
        /** @description Cap i18n {vi, en} (D17) — dung cho admin write. */
        I18nText: {
            vi: string;
            en: string;
        };
        /** @description Cap i18n nullable (null = khong SEO truong nay). */
        I18nTextNullable: {
            vi: string | null;
            en: string | null;
        } | null;
        ImageRef: {
            /** @description URL public (/media/** qua gateway). */
            url: string;
            alt?: string;
        };
        ProductImage: {
            url: string;
            alt?: string;
            /** @description Thu tu xuat hien trong gallery (0-based). */
            position: number;
        };
        /** @description Card san pham — cac truong i18n DA resolve theo locale. */
        ProductCard: {
            id: string;
            /** @description Slug DA resolve theo locale (vi hoac en). */
            slug: string;
            /** @description Slug tieng Anh (luon tra — de build URL cross-locale). */
            slugEn: string;
            /** @description Ten DA resolve theo locale. */
            name: string;
            brand?: string;
            /** @description Gia ban hien tai (VND). */
            price: number;
            /** @description Gia niem yet de gach ngang (VND). Bo di khi khong khuyen mai. */
            comparePrice?: number;
            /** @description Computed tu price/comparePrice (0-100). */
            discountPercent?: number;
            /**
             * Format: date-time
             * @description Neu san pham dang flash sale — het han countdown.
             */
            flashSaleEndsAt?: string;
            /** @description Diem trung binh (denormalized tu reviews). */
            ratingAvg: number;
            ratingCount: number;
            image: components["schemas"]["ImageRef"];
            /** @description Badge admin set (vd "Chinh hang", "Freeship"). */
            tags: string[];
            categoryId: string;
        };
        Variant: {
            id: string;
            /** @description Ten variant DA resolve (vd "Do / XL"). */
            name: string;
            /** @description Tue chon (vd {color: do, size: XL}). */
            options: {
                [key: string]: string;
            };
            /** @description Chenh lech gia so voi gia goc (VND, co the am). */
            priceDelta?: number;
            /** @description Ton kha dung. */
            stock: number;
        };
        /** @description ProductCard + thong tin day du cho PDP. */
        ProductDetail: components["schemas"]["ProductCard"] & {
            /** @description Mo ta DA resolve theo locale. */
            description: string;
            images: components["schemas"]["ProductImage"][];
            variants: components["schemas"]["Variant"][];
            /** @description So san pham lien quan (goi y API sau neu can — spec §6.1). */
            relatedCount?: number;
        };
        VariantWrite: {
            nameI18n: components["schemas"]["I18nText"];
            options: {
                [key: string]: string;
            };
            priceDelta?: number;
            stock: number;
        };
        /** @description Admin write — truong i18n dang object {vi, en} (D17). */
        ProductWrite: {
            nameI18n: components["schemas"]["I18nText"];
            descriptionI18n: components["schemas"]["I18nText"];
            seoTitleI18n?: components["schemas"]["I18nTextNullable"];
            seoDescriptionI18n?: components["schemas"]["I18nTextNullable"];
            slugVi: string;
            slugEn: string;
            brand?: string;
            /** @description Gia ban (VND). */
            price: number;
            comparePrice?: number;
            /** Format: date-time */
            flashSaleEndsAt?: string;
            tags?: string[];
            categoryId: string;
            images?: components["schemas"]["ProductImage"][];
            variants?: components["schemas"]["VariantWrite"][];
            /** @enum {string} */
            status: "DRAFT" | "PUBLISHED";
        };
        /** @description Item danh sach admin — ProductCard + status + slug goc. */
        ProductAdminItem: components["schemas"]["ProductCard"] & {
            /** @enum {string} */
            status: "DRAFT" | "PUBLISHED";
            slugVi?: string;
        };
        ProductAdminItemPage: {
            items: components["schemas"]["ProductAdminItem"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        /** @description View admin chi tiet — ProductDetail + status + truong i18n goc (PUT nhan/giai day du). */
        ProductAdminView: components["schemas"]["ProductDetail"] & {
            /** @enum {string} */
            status: "DRAFT" | "PUBLISHED";
            nameI18n: components["schemas"]["I18nText"];
            descriptionI18n: components["schemas"]["I18nText"];
            seoTitleI18n?: components["schemas"]["I18nTextNullable"];
            seoDescriptionI18n?: components["schemas"]["I18nTextNullable"];
            slugVi: string;
        };
        /** @description Page chuan {items, page, size, total}. */
        ProductCardPage: {
            items: components["schemas"]["ProductCard"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        /** @description Node danh muc — ten/slug resolve theo locale, children de quy. */
        Category: {
            id: string;
            /** @description Slug DA resolve theo locale. */
            slug: string;
            slugEn: string;
            /** @description Ten DA resolve theo locale. */
            name: string;
            /** @description Null = node goc. */
            parentId?: string | null;
            children: components["schemas"]["Category"][];
        };
        CategoryWrite: {
            nameI18n: components["schemas"]["I18nText"];
            slugVi: string;
            slugEn: string;
            /** @description Bo qua/null = tao danh muc goc. */
            parentId?: string;
        };
        /** @description Danh muc view admin — Category + i18n goc. */
        CategoryAdmin: components["schemas"]["Category"] & {
            nameI18n: components["schemas"]["I18nText"];
            slugVi: string;
        };
        /** @description Review UGC — KHONG i18n (D17). */
        Review: {
            id: string;
            userId: string;
            userName: string;
            rating: number;
            title?: string;
            content: string;
            /** @description Da mua hang tai he thong. */
            verifiedPurchase: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        ReviewList: {
            items: components["schemas"]["Review"][];
            /** @description So luong theo so sao — key "5".."1". */
            breakdown: {
                [key: string]: number;
            };
            total: number;
        };
        ReviewSubmitRequest: {
            rating: number;
            title?: string;
            content: string;
        };
        /** @description Review view duyet — kem productId + status. */
        ReviewAdmin: components["schemas"]["Review"] & {
            productId: string;
            /** @enum {string} */
            status: "PENDING" | "APPROVED" | "REJECTED";
        };
        ReviewAdminPage: {
            items: components["schemas"]["ReviewAdmin"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        SuggestResponse: {
            products: components["schemas"]["ProductCard"][];
            categories: {
                slug: string;
                name: string;
            }[];
        };
        WishlistIds: {
            productIds: string[];
        };
        StockAlertRequest: {
            /** Format: email */
            email: string;
            variantId: string;
        };
        UploadResponse: {
            /** @description URL public /media/** (phat qua gateway). */
            url: string;
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
        /** @description Khong du quyen (can role ADMIN hoac khong phai chu so huu). */
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
        /** @description Xung dot trang thai. */
        Conflict: {
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
        /** @description Slug san pham (vi hoac en). */
        SlugPath: string;
        /** @description Id tai nguyen. */
        IdPath: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listProducts: {
        parameters: {
            query?: {
                /** @description Loc theo slug danh muc (da resolve — dùng slug vi hoac en deu duoc). */
                category?: string;
                /** @description Gia toi thieu (VND). */
                minPrice?: number;
                /** @description Gia toi da (VND). */
                maxPrice?: number;
                /** @description Diem trung binh toi thieu (1.0 - 5.0). */
                minRating?: number;
                brand?: string;
                sort?: "price_asc" | "price_desc" | "rating" | "newest" | "discount";
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: {
                /** @description Dung khi khong co ?locale. Fallback vi. */
                "Accept-Language"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang san pham. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductCardPage"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getProduct: {
        parameters: {
            query?: {
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
            };
            header?: {
                /** @description Dung khi khong co ?locale. Fallback vi. */
                "Accept-Language"?: string;
            };
            path: {
                /** @description Slug san pham (vi hoac en). */
                slug: components["parameters"]["SlugPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Chi tiet san pham. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductDetail"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listProductReviews: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path: {
                /** @description Slug san pham (vi hoac en). */
                slug: components["parameters"]["SlugPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Reviews + breakdown. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewList"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    submitProductReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Slug san pham (vi hoac en). */
                slug: components["parameters"]["SlugPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewSubmitRequest"];
            };
        };
        responses: {
            /** @description Da nhan — cho duyet (PENDING). */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createStockAlert: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Slug san pham (vi hoac en). */
                slug: components["parameters"]["SlugPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StockAlertRequest"];
            };
        };
        responses: {
            /** @description Da nhan dang ky. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    getCategories: {
        parameters: {
            query?: {
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
            };
            header?: {
                /** @description Dung khi khong co ?locale. Fallback vi. */
                "Accept-Language"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cay danh muc (goc = cac node parentId null). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Category"][];
                };
            };
        };
    };
    searchProducts: {
        parameters: {
            query: {
                /** @description Tu khoa tim kiem. */
                q: string;
                /** @description Han che trong slug danh muc. */
                category?: string;
                sort?: "price_asc" | "price_desc" | "rating" | "newest" | "discount";
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
            };
            header?: {
                /** @description Ngon ngu resolve content. Fallback vi. */
                "Accept-Language"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ket qua tim kiem. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductCardPage"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    suggestProducts: {
        parameters: {
            query: {
                q: string;
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
            };
            header?: {
                /** @description Ngon ngu resolve content. Fallback vi. */
                "Accept-Language"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Goi y. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SuggestResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getWishlist: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
                /** @description Ngon ngu resolve content (D17). Mac dinh vi. */
                locale?: "vi" | "en";
            };
            header?: {
                /** @description Ngon ngu resolve content. Fallback vi. */
                "Accept-Language"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang wishlist. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductCardPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getWishlistIds: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Danh sach id. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WishlistIds"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    addWishlistItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Da them (idempotent — them lai van 204). */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    removeWishlistItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Da xoa (idempotent). */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    adminListProducts: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
                /** @description Tim theo ten/slug. */
                q?: string;
                status?: "DRAFT" | "PUBLISHED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang san pham (view admin). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductAdminItemPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminCreateProduct: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductWrite"];
            };
        };
        responses: {
            /** @description Da tao. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductAdminView"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminGetProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Full object voi truong i18n goc. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductAdminView"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminUpdateProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductWrite"];
            };
        };
        responses: {
            /** @description Da cap nhat — tra view admin. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductAdminView"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminDeleteProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Da xoa. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminListCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cay danh muc. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryAdmin"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminCreateCategory: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryWrite"];
            };
        };
        responses: {
            /** @description Da tao. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryAdmin"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminGetCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Chi tiet. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryAdmin"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminUpdateCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryWrite"];
            };
        };
        responses: {
            /** @description Da cap nhat. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryAdmin"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminDeleteCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Da xoa. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    adminListReviews: {
        parameters: {
            query?: {
                status?: "PENDING" | "APPROVED" | "REJECTED";
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
            /** @description Trang review (kem status + productId). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewAdminPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    adminApproveReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Review da APPROVED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewAdmin"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    adminRejectReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id tai nguyen. */
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Review da REJECTED. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewAdmin"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    uploadAdminImage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /**
                     * Format: binary
                     * @description File anh (jpg/png/webp, ≤5MB).
                     */
                    image: string;
                };
            };
        };
        responses: {
            /** @description Da upload. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadResponse"];
                };
            };
            /** @description File sai loai hoac qua 5MB. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}

