import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { CrudPageComponent } from './crud-page.component';
import { ToastService } from '../core/services/toast.service';
import type { CrudResource } from '../core/services/crud-resource';
import type { ColumnConfig, FieldConfig } from './crud-page.types';

class FakeResource {
  list = jasmine
    .createSpy('list')
    .and.returnValue(
      of({
        data: [{ id: 'p1', name: 'Cafetera', basePrice: 100, currencyCode: 'MXN', status: 'active' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 }
      })
    );
  create = jasmine.createSpy('create').and.returnValue(of({ id: 'new' }));
  update = jasmine.createSpy('update').and.returnValue(of({ id: 'p1' }));
  remove = jasmine.createSpy('remove').and.returnValue(of({ id: 'p1' }));
}

@Component({
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Productos"
      subtitle="Catálogo"
      entityLabel="producto"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [canCreate]="true"
      [canEdit]="true"
      [canDelete]="true"
      [pageSize]="10"
    />
  `
})
class HostComponent {
  service: CrudResource<any> = new FakeResource() as unknown as CrudResource<any>;
  columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'basePrice', label: 'Precio', type: 'money', currencyKey: 'currencyCode' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];
  fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'basePrice', label: 'Precio', type: 'number', required: true, min: 0 }
  ];
}

describe('CrudPageComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let fake: FakeResource;
  let page: CrudPageComponent;
  let toast: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fake = fixture.componentInstance.service as unknown as FakeResource;
    toast = TestBed.inject(ToastService);
    toast.clear();
  });

  function create(): void {
    fixture.detectChanges();
    page = fixture.debugElement.query(By.directive(CrudPageComponent)).componentInstance;
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('renders the header and the loaded rows', () => {
    create();

    expect(text()).toContain('Productos');
    expect(text()).toContain('Cafetera');
    expect(text()).toContain('100.00');
    expect(fixture.nativeElement.querySelector('[data-testid="data-table"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-summary"]').textContent).toContain(
      '1 registros'
    );
  });

  it('shows the loading state while the request is in flight', () => {
    const subject = new Subject<any>();
    fake.list.and.returnValue(subject);

    create();

    expect(fixture.nativeElement.querySelector('[data-state="loading"]')).toBeTruthy();

    subject.next({
      data: [{ id: 'p1', name: 'Cafetera', basePrice: 100, currencyCode: 'MXN', status: 'active' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 }
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-state="loading"]')).toBeNull();
    expect(text()).toContain('Cafetera');
  });

  it('shows the empty state when there are no records', () => {
    fake.list.and.returnValue(of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }));

    create();

    expect(fixture.nativeElement.querySelector('[data-state="empty"]')).toBeTruthy();
  });

  it('shows the error state and retries', () => {
    fake.list.and.returnValue(throwError(() => ({ error: { message: 'Servidor no disponible' } })));

    create();

    expect(fixture.nativeElement.querySelector('[data-state="error"]')).toBeTruthy();
    expect(text()).toContain('Servidor no disponible');

    fake.list.and.returnValue(of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }));
    fixture.debugElement.query(By.css('[data-state="error"] button')).nativeElement.click();
    fixture.detectChanges();

    expect(fake.list).toHaveBeenCalledTimes(2);
  });

  it('creates a record through the modal form', () => {
    create();

    fixture.debugElement.query(By.css('[data-testid="create-button"]')).nativeElement.click();
    fixture.detectChanges();

    expect(text()).toContain('Nuevo producto');

    page.form.patchValue({ name: 'Tostadora', basePrice: 50 });
    fixture.debugElement.query(By.css('[data-testid="submit-button"]')).nativeElement.click();

    expect(fake.create).toHaveBeenCalledWith({ name: 'Tostadora', basePrice: 50 });
    expect(toast.toasts().some((item) => item.kind === 'success')).toBe(true);
  });

  it('blocks submission while the form is invalid', () => {
    create();

    fixture.debugElement.query(By.css('[data-testid="create-button"]')).nativeElement.click();
    fixture.detectChanges();

    fixture.debugElement.query(By.css('[data-testid="submit-button"]')).nativeElement.click();

    expect(fake.create).not.toHaveBeenCalled();
  });

  it('opens the edit modal prefilled and updates the record', () => {
    create();

    fixture.debugElement.query(By.css('[data-testid="edit-button"]')).nativeElement.click();
    fixture.detectChanges();

    expect(text()).toContain('Editar producto');
    expect(page.form.get('name')?.value).toBe('Cafetera');

    page.form.patchValue({ name: 'Cafetera premium' });
    page.submit();

    expect(fake.update).toHaveBeenCalledWith('p1', jasmine.objectContaining({ name: 'Cafetera premium' }));
  });

  it('confirms and performs a soft delete', () => {
    create();

    fixture.debugElement.query(By.css('[data-testid="delete-button"]')).nativeElement.click();
    fixture.detectChanges();
    expect(text()).toContain('Confirmar eliminación');

    fixture.debugElement.query(By.css('[data-testid="confirm-delete-button"]')).nativeElement.click();

    expect(fake.remove).toHaveBeenCalledWith('p1');
  });

  it('reports a failed delete through a toast', () => {
    fake.remove.and.returnValue(throwError(() => ({ error: { message: 'No permitido' } })));

    create();
    fixture.debugElement.query(By.css('[data-testid="delete-button"]')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('[data-testid="confirm-delete-button"]')).nativeElement.click();

    expect(toast.toasts().some((item) => item.kind === 'error')).toBe(true);
  });

  it('surfaces API field errors in the form', () => {
    fake.create.and.returnValue(
      throwError(() => ({ error: { message: 'Invalid input', details: [{ field: 'name', message: 'Requerido' }] } }))
    );

    create();
    fixture.debugElement.query(By.css('[data-testid="create-button"]')).nativeElement.click();
    fixture.detectChanges();

    page.form.patchValue({ name: 'X', basePrice: 1 });
    page.submit();
    fixture.detectChanges();

    expect(text()).toContain('Invalid input');
    expect(text()).toContain('Requerido');
  });

  it('debounces the search box and reloads with the term', fakeAsync(() => {
    create();
    fake.list.calls.reset();

    page.searchInput.setValue('cafe');
    tick(400);
    fixture.detectChanges();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'cafe', page: 1 }));
  }));

  it('filters by status chip', () => {
    create();
    fake.list.calls.reset();

    fixture.debugElement
      .queryAll(By.css('[data-testid="status-chips"] button'))
      .find((button) => button.nativeElement.textContent.includes('Inactivos'))!
      .nativeElement.click();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'inactive' }));
  });

  it('sorts by a sortable column and toggles the direction', () => {
    create();
    fake.list.calls.reset();

    fixture.debugElement.queryAll(By.css('thead th'))[0].nativeElement.click();
    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ sort: 'name', order: 'asc' }));

    fake.list.calls.reset();
    fixture.debugElement.queryAll(By.css('thead th'))[0].nativeElement.click();
    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ sort: 'name', order: 'desc' }));
  });

  it('paginates to the next page', () => {
    fake.list.and.returnValue(
      of({ data: [{ id: 'p1', name: 'A', basePrice: 1, currencyCode: 'MXN', status: 'active' }], meta: { page: 1, limit: 10, total: 25, totalPages: 3 } })
    );

    create();
    fake.list.calls.reset();

    fixture.debugElement
      .queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Siguiente'))!
      .nativeElement.click();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2 }));
  });

  it('closes the modal on cancel', () => {
    create();
    fixture.debugElement.query(By.css('[data-testid="create-button"]')).nativeElement.click();
    fixture.detectChanges();

    page.closeModal();
    fixture.detectChanges();

    expect(page.modalOpen()).toBe(false);
  });

  it('exposes the visible fields and row actions helpers', () => {
    create();

    expect(page.visibleFields().length).toBe(2);
    expect(page.visibleRowActions({ id: 'p1' })).toEqual([]);
  });
});
