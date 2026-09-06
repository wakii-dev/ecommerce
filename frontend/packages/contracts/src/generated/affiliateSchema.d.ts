export interface paths {
    "/api/affiliate/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đăng ký làm affiliate (JWT customer)
         * @description Gửi hồ sơ → 202 chờ admin duyệt (không auto-approve).
         */
        post: operations["registerAffiliate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Hồ sơ affiliate của user hiện tại
         * @description Trả hồ sơ kèm ref code (null khi chưa APPROVED), rate và stats tổng.
         */
        get: operations["getMyAffiliateProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/me/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sổ hoa hồng của affiliate hiện tại
         * @description Mỗi entry là một đơn được tính hoa hồng; PENDING → CONFIRMED khi qua cửa hoàn tiền.
         */
        get: operations["listMyLedger"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/track/click": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Capture click từ ref code (public — storefront gọi)
         * @description Public: storefront capture khi người dùng vào qua link ref. Ghi click attribution
         *     (cookie window do service quản); response 204 rỗng — không lộ trạng thái code.
         */
        post: operations["trackClick"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/admin/affiliates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sách hồ sơ affiliate (admin)
         * @description Lọc theo trạng thái duyệt; phân trang 1-based.
         */
        get: operations["listAffiliates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/admin/affiliates/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Duyệt affiliate (sinh ref code + rate mặc định)
         * @description Chỉ PENDING mới approve được; APPROVED sinh ref code và rate mặc định hệ thống.
         */
        post: operations["approveAffiliate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/admin/affiliates/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Từ chối hồ sơ affiliate
         * @description Chỉ PENDING mới reject được; user có thể đăng ký lại sau.
         */
        post: operations["rejectAffiliate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/admin/affiliates/{id}/rate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Đặt tỷ lệ hoa hồng (%) cho affiliate
         * @description Áp dụng cho các đơn tính hoa hồng sau thời điểm đổi; ledger cũ giữ nguyên rate cũ.
         */
        put: operations["updateAffiliateRate"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/admin/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stats affiliate tổng hợp theo khoảng thời gian
         * @description Bỏ from/to → toàn bộ; dùng cho dashboard admin.
         */
        get: operations["getAffiliateStats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/affiliate/internal/loyalty/redeem": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đổi điểm loyalty lấy giảm giá (internal D22)
         * @description x-internal-only: ordering-service gọi khi tạo đơn có `usePoints`. Trừ điểm, trả số
         *     tiền giảm tương ứng (quy đổi do service lo) + số điểm còn lại. Accounts/ledger điểm
         *     thuộc affiliate-service (SF-14). Fail (điểm không đủ) → 409 problem+json.
         */
        post: operations["redeemLoyaltyPoints"];
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
        AffiliateRegisterRequest: {
            /**
             * Format: uri
             * @description Link kênh giới thiệu (blog/social) — để admin review
             */
            portfolioUrl?: string;
            note?: string;
        };
        /** @enum {string} */
        AffiliateStatus: "PENDING" | "APPROVED" | "REJECTED";
        AffiliatePending: {
            id: string;
            status: components["schemas"]["AffiliateStatus"];
        };
        AffiliateStats: {
            clicks: number;
            conversions: number;
            /** @description Tổng hoa hồng VND */
            earnings: number;
        };
        AffiliateProfile: {
            id: string;
            /** @description Ref code — null cho đến khi APPROVED */
            code: string | null;
            status: components["schemas"]["AffiliateStatus"];
            /** @description Tỷ lệ hoa hồng (%) */
            rate: number;
            stats: components["schemas"]["AffiliateStats"];
        };
        /** @description Page chuẩn {items, page, size, total} */
        AffiliateProfilePage: {
            items: components["schemas"]["AffiliateProfile"][];
            page: number;
            size: number;
            total: number;
        };
        /**
         * @description PENDING khi đơn mới; CONFIRMED khi qua cửa hoàn tiền (7 ngày)
         * @enum {string}
         */
        LedgerStatus: "PENDING" | "CONFIRMED";
        LedgerEntry: {
            id: string;
            orderId: string;
            /** @description Giá trị đơn VND được tính hoa hồng */
            orderTotal: number;
            /** @description Tỷ lệ % áp dụng tại thời điểm đơn */
            rate: number;
            /** @description Hoa hồng VND = round(orderTotal x rate / 100) */
            commission: number;
            status: components["schemas"]["LedgerStatus"];
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Page chuẩn {items, page, size, total} */
        LedgerPage: {
            items: components["schemas"]["LedgerEntry"][];
            page: number;
            size: number;
            total: number;
        };
        TrackClickRequest: {
            /** @description Ref code affiliate trên link (vd ?ref=ABC123) */
            refCode: string;
        };
        UpdateRateRequest: {
            /** @description Tỷ lệ hoa hồng mới (%), 0 < rate ≤ 50 */
            rate: number;
        };
        AffiliateAdminStats: {
            /** @description Tổng hồ sơ (mọi trạng thái) trong khoảng */
            totalAffiliates: number;
            activeClicks: number;
            conversions: number;
            /** @description Tổng hoa hồng VND trong khoảng */
            totalCommission: number;
        };
        RedeemPointsRequest: {
            userId: string;
            /** @description Số điểm muốn dùng cho đơn này */
            points: number;
            /** @description Đơn gắn lần redeem này (dedupe) */
            orderId: string;
        };
        RedeemResult: {
            /** @description Số tiền giảm VND tương ứng điểm đã dùng */
            discount: number;
            /** @description Điểm còn lại của user */
            remaining: number;
        };
    };
    responses: never;
    parameters: {
        /** @description Số trang (1-based) */
        Page: number;
        /** @description Id hồ sơ affiliate */
        AffiliateId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    registerAffiliate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AffiliateRegisterRequest"];
            };
        };
        responses: {
            /** @description Đã nhận hồ sơ — chờ duyệt */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliatePending"];
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
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description User đã có hồ sơ affiliate */
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
    getMyAffiliateProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Hồ sơ + ref code + stats tổng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateProfile"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Chưa đăng ký affiliate */
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
    listMyLedger: {
        parameters: {
            query?: {
                /** @description Số trang (1-based) */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page ledger */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LedgerPage"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    trackClick: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackClickRequest"];
            };
        };
        responses: {
            /** @description Đã ghi nhận (kể cả code không tồn tại — im lặng tránh lộ) */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Body thiếu refCode */
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
    listAffiliates: {
        parameters: {
            query?: {
                status?: components["schemas"]["AffiliateStatus"];
                /** @description Số trang (1-based) */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page hồ sơ affiliate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateProfilePage"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    approveAffiliate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id hồ sơ affiliate */
                id: components["parameters"]["AffiliateId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Hồ sơ đã duyệt */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateProfile"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Hồ sơ không ở trạng thái PENDING */
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
    rejectAffiliate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id hồ sơ affiliate */
                id: components["parameters"]["AffiliateId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Hồ sơ bị từ chối */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateProfile"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Hồ sơ không ở trạng thái PENDING */
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
    updateAffiliateRate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id hồ sơ affiliate */
                id: components["parameters"]["AffiliateId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateRateRequest"];
            };
        };
        responses: {
            /** @description Hồ sơ với rate mới */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateProfile"];
                };
            };
            /** @description Rate ngoài khoảng cho phép */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getAffiliateStats: {
        parameters: {
            query?: {
                /** @description Bắt đầu khoảng ( inclusive, ngày local) */
                from?: string;
                /** @description Kết thúc khoảng (inclusive, ngày local) */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stats tổng hợp */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffiliateAdminStats"];
                };
            };
            /** @description Chưa đăng nhập / token hết hạn */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    redeemLoyaltyPoints: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RedeemPointsRequest"];
            };
        };
        responses: {
            /** @description Đã trừ điểm */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedeemResult"];
                };
            };
            /** @description Payload không hợp lệ (points ≤ 0) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
            /** @description Điểm không đủ hoặc order đã redeem */
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
}

