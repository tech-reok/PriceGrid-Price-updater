import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { ShellComponent } from './shell.component';
import { APP_ICONS } from '../core/icons';
import { AuthService } from '../core/services/auth.service';
import { TenantService } from '../core/services/access.services';
import { SessionStore } from '../core/services/session.store';

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: AuthService, useValue: { logout: jasmine.createSpy('logout').and.returnValue(of(undefined)) } },
        { provide: TenantService, useValue: { list: jasmine.createSpy('list').and.returnValue(of({ data: [] })) } }
      ]
    }).compileComponents();

    const session = TestBed.inject(SessionStore);
    session.setSession('token', {
      id: 'user-1',
      email: 'viewer@example.com',
      name: 'Price Viewer',
      roleId: 'role-1',
      roleSlug: 'price_catalog_viewer',
      tenantId: 'tenant-1',
      isGlobalAdmin: false,
      permissions: ['price-catalog:read']
    });

    fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the registered search and catalog navigation icons', () => {
    expect(fixture.nativeElement.querySelector('svg.lucide-search')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('svg.lucide-scan-search')).toBeTruthy();
  });
});
