import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../servicios/auth';

export const authGuard: CanActivateFn = () => {
  if (inject(AuthService).getToken()) {
    return true;
  }

  void inject(Router).navigate(['/login']);
  return false;
};
