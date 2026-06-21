import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export class AppException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly details: any;

  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details: any = null,
  ) {
    super(message, status);
    this.errorCode = errorCode;
    this.details = details;
  }
}
