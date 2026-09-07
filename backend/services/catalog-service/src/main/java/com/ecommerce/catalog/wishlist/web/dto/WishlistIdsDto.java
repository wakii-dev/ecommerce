package com.ecommerce.catalog.wishlist.web.dto;

import java.util.List;
import java.util.UUID;

/** WishlistIds — khớp contract {productIds[]} (heart state check nhanh). */
public record WishlistIdsDto(List<UUID> productIds) {
}
