export interface paths {
    "/api/identity/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dang ky tai khoan
         * @description Tao tai khoan moi voi role mac dinh CUSTOMER. Email phai duy nhat.
         */
        post: operations["register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dang nhap email + mat khau
         * @description Tra `LoginSuccess` (accessToken + set cookie httpOnly refresh_token).
         *     Neu user bat 2FA (D22): tra `TwoFactorChallenge` voi HTTP 200 — client goi
         *     `POST /api/identity/2fa/verify` kem challengeToken de hoan tat.
         */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Lam moi access token
         * @description KHONG co request body. Server doc cookie httpOnly `refresh_token`;
         *     cookie het hạn / khong hop le → 401. Response KHONG tra refresh token moi
         *     trong body (cookie xoay boi server qua Set-Cookie).
         */
        post: operations["refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dang xuat
         * @description Vo hieu hoa refresh token + xoa cookie httpOnly (Set-Cookie Max-Age=0).
         */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Profile user hien tai
         * @description Can JWT bearer. Tra profile + trang thai 2FA.
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/.well-known/jwks.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * JWKS public key (RFC 7517)
         * @description JWKS path PIN — gateway (SF-3) va cac service (SF-5) verify JWT RS256 qua day.
         *     Tra RFC 7517 JSON Web Key Set: `{keys: [{kty, kid, alg: RS256, use: sig, n, e}]}`.
         */
        get: operations["getJwks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Danh sach user (admin)
         * @description Can JWT bearer role ADMIN. Tim kiem theo q (email/ten, chua hoa don).
         */
        get: operations["adminListUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/password/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Yeu cau dat lai mat khau (D21)
         * @description LUON tra 202 bat ke email co ton tai hay khong (khong lo user ton tai).
         *     Email chua token het han 30 phut, gui qua notification-service.
         */
        post: operations["forgotPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dat lai mat khau bang token (D21)
         * @description Token tu email forgot, het han 30 phut, dung mot lan.
         */
        post: operations["resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/oauth/{provider}/authorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bat dau OAuth Google/Facebook (D22)
         * @description 302 redirect sang trang consent cua provider. Flow chi tiet SF-15.
         */
        get: operations["oauthAuthorize"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/oauth/{provider}/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Callback OAuth tu provider (D22)
         * @description Provider redirect ve day voi `code` mot-lan; service doi code lay profile,
         *     find-or-create user + link email, roi 302 ve FE kem code mot-lan (query)
         *     hoac tham so error neu tu choi. Flow chi tiet SF-15.
         */
        get: operations["oauthCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/2fa/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sinh secret TOTP (D22)
         * @description Can JWT. Tra secret + otpauthUrl de client quet QR. Chua bat 2FA.
         */
        post: operations["setup2fa"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/2fa/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kich hoat 2FA bang ma TOTP (D22)
         * @description Can JWT. Xac nhan code tu authenticator app; thanh cong thi bat 2FA.
         */
        post: operations["enable2fa"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/2fa/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tat 2FA (D22)
         * @description Can JWT. Bat buoc xac nhan lai mat khau.
         */
        post: operations["disable2fa"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/identity/2fa/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Xac nhan challenge 2FA khi login (D22)
         * @description Khong can JWT — xac thuc bang challengeToken tu login + ma TOTP.
         */
        post: operations["verify2fa"];
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
        RegisterRequest: {
            /** Format: email */
            email: string;
            /** @description Toi thieu 8 ky tu. */
            password: string;
            fullName: string;
        };
        UserSummary: {
            id: string;
            /** Format: email */
            email: string;
            fullName: string;
            /** @description Vd [CUSTOMER]; admin co them ADMIN. */
            roles: string[];
        };
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        /** @description Login thanh thuong HOAC challenge 2FA (oneOf). */
        LoginResponse: components["schemas"]["LoginSuccess"] | components["schemas"]["TwoFactorChallenge"];
        LoginSuccess: {
            accessToken: string;
            /** @enum {string} */
            tokenType: "Bearer";
            /** @description Thoi han access token (giay). */
            expiresIn: number;
            user: components["schemas"]["UserSummary"];
        };
        TwoFactorChallenge: {
            /** @constant */
            twoFactorRequired: true;
            /** @description Dung mot lan, ngan han — gui lai voi ma TOTP o /2fa/verify. */
            challengeToken: string;
        };
        RefreshResponse: {
            accessToken: string;
            /** @description Thoi han access token (giay). */
            expiresIn: number;
        };
        Me: {
            id: string;
            /** Format: email */
            email: string;
            fullName: string;
            roles: string[];
            twoFactorEnabled: boolean;
        };
        /** @description Mot JSON Web Key (RFC 7517) — RSA RS256. */
        Jwk: {
            /** @enum {string} */
            kty: "RSA";
            kid: string;
            /** @enum {string} */
            alg: "RS256";
            /** @enum {string} */
            use: "sig";
            /** @description Modulus base64url. */
            n: string;
            /** @description Exponent base64url. */
            e: string;
        };
        Jwks: {
            keys: components["schemas"]["Jwk"][];
        };
        AdminUser: {
            id: string;
            /** Format: email */
            email: string;
            fullName: string;
            roles: string[];
            /** Format: date-time */
            createdAt: string;
        };
        AdminUserPage: {
            items: components["schemas"]["AdminUser"][];
            /** @description Trang hien tai (1-based). */
            page: number;
            size: number;
            total: number;
        };
        ForgotPasswordRequest: {
            /** Format: email */
            email: string;
        };
        ResetPasswordRequest: {
            token: string;
            newPassword: string;
        };
        TwoFactorSetupResponse: {
            /** @description Base32 secret cho authenticator app. */
            secret: string;
            /** @description otpauth://totp/... de quet QR. */
            otpauthUrl: string;
        };
        TwoFactorEnableRequest: {
            /** @description Ma TOTP 6 chu so hien tai. */
            code: string;
        };
        TwoFactorEnableResponse: {
            /** @description Ma du phong — chi hien mot lan. */
            recoveryCodes: string[];
        };
        TwoFactorDisableRequest: {
            password: string;
        };
        TwoFactorVerifyRequest: {
            challengeToken: string;
            /** @description Ma TOTP 6 chu so hoac recovery code. */
            code: string;
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
        /** @description Chua xac thuc / token hoac cookie het han. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Khong du quyen (can role ADMIN...). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ApiError"];
            };
        };
        /** @description Xung dot trang thai (vd email da ton tai). */
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
        /** @description OAuth provider. */
        OAuthProvider: "google" | "facebook";
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Da tao tai khoan. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserSummary"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Dang nhap thanh cong — hoac challenge 2FA neu user bat hai lop. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
        };
    };
    refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Access token moi. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefreshResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Da dang xuat; cookie refresh_token duoc xoa. */
            204: {
                headers: {
                    /** @description Xoa cookie refresh_token. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Profile user. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getJwks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description JSON Web Key Set. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Jwks"];
                };
            };
        };
    };
    adminListUsers: {
        parameters: {
            query?: {
                /** @description So trang — 1-based. */
                page?: components["parameters"]["Page"];
                /** @description So item moi trang (mac dinh 20, toi da 100). */
                size?: components["parameters"]["Size"];
                /** @description Tu khoa tim kiem (email hoac fullName). */
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trang user. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUserPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    forgotPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordRequest"];
            };
        };
        responses: {
            /** @description Da nhan yeu cau (khong lo email ton tai hay khong). */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
        };
    };
    resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description Da doi mat khau. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            /** @description Token sai hoac het han. */
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
    oauthAuthorize: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description OAuth provider. */
                provider: components["parameters"]["OAuthProvider"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect sang provider. */
            302: {
                headers: {
                    /** @description URL consent cua provider. */
                    Location: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider khong ho tro (chi google|facebook). */
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
    oauthCallback: {
        parameters: {
            query?: {
                /** @description Authorization code tu provider. */
                code?: string;
                /** @description Ma loi tu provider (vd access_denied). */
                error?: string;
            };
            header?: never;
            path: {
                /** @description OAuth provider. */
                provider: components["parameters"]["OAuthProvider"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect ve FE kem one-time code (hoac error). */
            302: {
                headers: {
                    /** @description URL FE redirect URI kem code/error. */
                    Location: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider khong ho tro hoac callback sai tham so. */
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
    setup2fa: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Secret TOTP moi (chua kich hoat). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TwoFactorSetupResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description 2FA da bat tu truoc. */
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
    enable2fa: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TwoFactorEnableRequest"];
            };
        };
        responses: {
            /** @description Da bat 2FA — tra recovery codes (hien mot lan). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TwoFactorEnableResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
        };
    };
    disable2fa: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TwoFactorDisableRequest"];
            };
        };
        responses: {
            /** @description Da tat 2FA. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            /** @description Mat khau sai. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    verify2fa: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TwoFactorVerifyRequest"];
            };
        };
        responses: {
            /** @description Dang nhap thanh cong. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginSuccess"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description challengeToken het han hoac code sai. */
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
}

