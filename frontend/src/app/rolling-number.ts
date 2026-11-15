import { Component, computed, input } from '@angular/core';
@Component({
 selector:'filegrid-rolling-number',standalone:true,
 template:`<span class="sr-only">{{value() ?? '—'}}</span><span aria-hidden="true" class="rolling-number">@for(version of [text()];track version){@for(digit of version;track $index){<span class="digit-window"><span class="digit-reel" [style.--digit]="digit==='—'?0:+digit">@for(n of numbers;track $index){<span [attr.data-digit]="digit==='—'?'—':n"></span>}</span></span>}}</span>`,
 styles:[`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.rolling-number{display:inline-flex;font-variant-numeric:tabular-nums}.digit-window{height:1.15em;overflow:hidden;display:inline-block}.digit-reel{display:flex;flex-direction:column;transform:translateY(calc(var(--digit)*-1.15em));animation:roll-number .75s cubic-bezier(.2,.8,.2,1)}.digit-reel>span::before{content:attr(data-digit)}.digit-reel>span{height:1.15em;line-height:1.15em;flex-shrink:0}@keyframes roll-number{from{transform:translateY(calc((var(--digit) + 10)*-1.15em))}to{transform:translateY(calc(var(--digit)*-1.15em))}}@media(prefers-reduced-motion:reduce){.digit-reel{animation:none}}`]
})
export class RollingNumberComponent {
 readonly value=input<number|null|undefined>();
 readonly text=computed(()=>this.value()==null?'—':String(this.value()));
 readonly numbers=Array.from({length:20},(_,i)=>i%10);
}
