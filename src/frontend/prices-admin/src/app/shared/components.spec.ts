import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StatusBadgeComponent } from './status-badge.component';
import { StatePanelComponent } from './state-panel.component';
import { ModalComponent } from './modal.component';
import { ToastHostComponent } from './toast-host.component';
import { ToastService } from '../core/services/toast.service';

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusBadgeComponent] }).compileComponents();
    fixture = TestBed.createComponent(StatusBadgeComponent);
  });

  function render(value: string): HTMLElement {
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[data-testid="status-badge"]');
  }

  it('renders the Spanish label for active', () => {
    const element = render('active');
    expect(element.textContent).toContain('Activo');
    expect(element.className).toContain('bg-positive/10');
  });

  it('renders inactive, revoked and expired states', () => {
    expect(render('inactive').textContent).toContain('Inactivo');
    expect(render('revoked').textContent).toContain('Revocado');
    expect(render('expired').textContent).toContain('Expirado');
  });

  it('uses a neutral tone for unknown values', () => {
    const element = render('weird');
    expect(element.textContent).toContain('weird');
    expect(element.className).toContain('bg-sidebar');
  });
});

describe('StatePanelComponent', () => {
  let fixture: ComponentFixture<StatePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatePanelComponent] }).compileComponents();
    fixture = TestBed.createComponent(StatePanelComponent);
  });

  it('renders the loading state', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-state]');
    expect(panel.getAttribute('data-state')).toBe('loading');
    expect(fixture.nativeElement.textContent).toContain('Cargando');
  });

  it('renders the empty state with its message', () => {
    fixture.componentRef.setInput('state', 'empty');
    fixture.componentRef.setInput('title', 'Sin productos');
    fixture.componentRef.setInput('message', 'Crea el primero');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sin productos');
    expect(fixture.nativeElement.textContent).toContain('Crea el primero');
  });

  it('renders the error state and emits retry', () => {
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('message', 'Fallo de red');
    fixture.detectChanges();

    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));

    expect(fixture.nativeElement.textContent).toContain('Fallo de red');
    fixture.debugElement.query(By.css('button')).nativeElement.click();
    expect(retried).toBe(true);
  });

  it('hides the retry button when disabled', () => {
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('showRetry', false);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('button'))).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `<app-modal [open]="open" [title]="title" (closed)="closed = true"><p>Contenido</p></app-modal>`
})
class ModalHostComponent {
  open = false;
  title = 'Título';
  closed = false;
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<ModalHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ModalHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ModalHostComponent);
  });

  it('renders nothing while closed', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('projects content and emits closed', () => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Contenido');
    expect(fixture.nativeElement.textContent).toContain('Título');

    fixture.debugElement.query(By.css('button[aria-label="Cerrar"]')).nativeElement.click();
    expect(fixture.componentInstance.closed).toBe(true);
  });
});

describe('ToastHostComponent', () => {
  let fixture: ComponentFixture<ToastHostComponent>;
  let service: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ToastHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ToastHostComponent);
    service = TestBed.inject(ToastService);
    service.clear();
  });

  it('renders queued toasts with their tone', () => {
    service.success('Guardado');
    service.error('Falló');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Guardado');
    expect(text).toContain('Falló');
  });

  it('dismisses a toast', () => {
    const id = service.info('Info');
    fixture.detectChanges();

    fixture.debugElement.query(By.css('button')).nativeElement.click();
    expect(service.toasts().some((toast) => toast.id === id)).toBe(false);
  });

  it('dismisses automatically', (done) => {
    service.show('Temporal', 'info', 10);
    expect(service.toasts().length).toBe(1);

    setTimeout(() => {
      expect(service.toasts().length).toBe(0);
      done();
    }, 30);
  });
});

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    service.clear();
  });

  it('queues toasts of each kind', () => {
    service.success('a');
    service.error('b');
    service.info('c');

    expect(service.toasts().map((toast) => toast.kind)).toEqual(['success', 'error', 'info']);
  });

  it('clears every toast', () => {
    service.info('a');
    service.clear();
    expect(service.toasts()).toEqual([]);
  });
});
