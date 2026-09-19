import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { LucideAngularModule } from 'lucide-angular';

import { routes } from './app.routes';
import { APP_ICONS } from './core/icons';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // ngx-charts renders through Angular animations.
    provideAnimationsAsync(),
    // Registers the lucide icons used across the dashboard.
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
    // jwtInterceptor attaches the token; errorInterceptor performs the
    // single-flight refresh on 401 and logs out when that fails.
    provideHttpClient(withInterceptors([jwtInterceptor, errorInterceptor]))
  ]
};
