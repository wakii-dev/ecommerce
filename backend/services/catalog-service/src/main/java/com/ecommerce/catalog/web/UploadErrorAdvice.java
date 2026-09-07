package com.ecommerce.catalog.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Upload error mapping (SF-13 A3): multipart vượt limit servlet (6MB) ném
 * {@link MaxUploadSizeExceededException} TRƯỚC controller — map về 400
 * problem+json thay vì 500 raw (review G1 P2). Business limit 5MB vẫn do
 * {@code ProductStorage} (400 với message rõ).
 */
@ControllerAdvice
public class UploadErrorAdvice {

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseStatusException tooLarge(MaxUploadSizeExceededException e) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ảnh vượt giới hạn 5MB.");
    }
}
