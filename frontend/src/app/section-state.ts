import { Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
export interface SectionState { loading: boolean; error: string; updatedAt: string | null }
@Component({
  selector: "filegrid-section-state",
  standalone: true,
  imports: [DatePipe],
  template: `@if (state(); as s) {
    <div class="section-state" aria-live="polite" [attr.aria-busy]="s.loading">
      @if (s.loading) { <p>Se încarcă {{ label() }}…</p> }
      @if (s.error) {
        <p class="data-stale">{{ s.error }} {{ s.updatedAt ? 'Sunt afișate ultimele date primite.' : 'Datele nu au putut fi încărcate.' }}</p>
        <button class="secondary" (click)="retry.emit()" [disabled]="s.loading">Reîncearcă {{ label() }}</button>
      }
      @if (s.updatedAt) { <small>Actualizat la {{ s.updatedAt | date:'HH:mm:ss' }}</small> }
    </div>
  }`,
})
export class SectionStateComponent {
  state = input<SectionState>();
  label = input("");
  retry = output<void>();
}
