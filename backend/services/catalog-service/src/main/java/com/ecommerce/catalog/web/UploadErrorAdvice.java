package com.ecommerce.catalog.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Upload error mapping (SF-13 A3): multipart vượt limit servlet (6MB) ném
 * {@link MaxUploadSizeExceededException} TRƯỚC controller — map về 400
 * problem+json (review G2 P1: @ExceptionHandler PHẢI trả ResponseEntity/
 * ProblemDetail — trả ResponseStatusException thì Spring không translate).
 * Business limit 5MB vẫn do {@code ProductStorage} (400 với message rõ).
 */
@RestControllerAdvice
public class UploadErrorAdvice {

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail tooLarge(MaxUploadSizeExceededException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Ảnh vượt giới hạn 5MB.");
    }
}
