package com.ecommerce.identity.auth;

import java.util.List;

/** Trang {items,page,size,total} — page/size 1-based (contract admin users). */
public record AdminUserPage(List<AdminUserDto> items, int page, int size, int total) {}
