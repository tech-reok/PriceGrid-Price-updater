import { Component } from '@angular/core';

@Component({
  selector: 'app-pricegrid-logo',
  standalone: true,
  template: `
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          fill="none"
          class="w-9 h-9"
        >
          <defs>
            <mask id="pricegrid-tag-hole" maskUnits="userSpaceOnUse">
              <rect width="512" height="512" fill="white" />
              <circle cx="392" cy="116" r="34" fill="black" />
            </mask>
          </defs>
          <path
            d="M218 38 430 53c16 1 29 14 30 30l15 214c1 13-4 26-13 35L280 514c-20 20-53 20-73 0L1 308c-20-20-20-53 0-73L185 51c9-9 21-14 33-13z"
            fill="#314534"
            mask="url(#pricegrid-tag-hole)"
          />

          <g>
            <line x1="160" y1="240" x2="352" y2="240" stroke="#FAFBF6" stroke-width="20" stroke-linecap="round" />
            <line x1="160" y1="350" x2="352" y2="350" stroke="#FAFBF6" stroke-width="20" stroke-linecap="round" />
            <line x1="200" y1="190" x2="200" y2="410" stroke="#FAFBF6" stroke-width="20" stroke-linecap="round" />
            <line x1="312" y1="190" x2="312" y2="410" stroke="#FAFBF6" stroke-width="20" stroke-linecap="round" />

            <path
              d="M 200 350 L 256 350 L 256 295 L 312 295 L 312 240"
              fill="none"
              stroke="#7FA36B"
              stroke-width="16"
              stroke-linejoin="round"
            />
            <circle cx="312" cy="240" r="22" fill="#FAFBF6" stroke="#7FA36B" stroke-width="10" />
            <circle cx="200" cy="350" r="22" fill="#7FA36B" />
            <circle cx="256" cy="295" r="16" fill="#7FA36B" />
            <circle cx="200" cy="240" r="14" fill="#FAFBF6" />
            <circle cx="312" cy="350" r="14" fill="#FAFBF6" />
          </g>
        </svg>
      </div>
      <span class="text-xl font-bold text-[#314534] tracking-tight">
        Price<span class="font-medium text-[#66745C]">Grid</span>
      </span>
    </div>
  `
})
export class PriceGridLogoComponent {}
