import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private swRegistration: ServiceWorkerRegistration | null = null;

  async init(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
    } catch {
      console.warn('[Push] Service Worker no se pudo registrar');
    }
  }

  async suscribir(): Promise<boolean> {
    if (!this.authService.isAuthenticated()) return false;

    // Espera hasta 10s a que el Service Worker termine de registrarse.
    for (let i = 0; i < 100; i++) {
      if (this.swRegistration) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!this.swRegistration) {
      console.warn('[Push] Service Worker no disponible después de 10s');
      return false;
    }

    let permiso = Notification.permission;
    if (permiso === 'default') {
      permiso = await Notification.requestPermission();
    }
    if (permiso !== 'granted') {
      console.warn('[Push] Permiso denegado:', permiso);
      return false;
    }

    try {
      const sub = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(environment.vapidPublicKey) as any
      });

      const body = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(sub.getKey('p256dh')!),
          auth: this.arrayBufferToBase64(sub.getKey('auth')!)
        }
      };

      this.http.post(`${environment.apiUrl}/push/suscribir`, body).subscribe({
        error: (err) => console.warn('[Push] Error al enviar suscripción al backend:', err)
      });
      return true;
    } catch (err) {
      console.warn('[Push] Suscripción falló:', err);
      return false;
    }
  }

  async desuscribir(): Promise<void> {
    if (!this.swRegistration) return;
    try {
      const sub = await this.swRegistration.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        this.http.delete(`${environment.apiUrl}/push/desuscribir`, { body: { endpoint } }).subscribe({
          error: (err) => console.warn('[Push] Error al desuscribir:', err)
        });
      }
    } catch {
      console.warn('[Push] Error al desuscribirse');
    }
  }

  // Convierte una clave VAPID base64 a Uint8Array (formato que exige pushManager.subscribe).
  private urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // Convierte un ArrayBuffer a string base64 (formato que espera el backend).
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
