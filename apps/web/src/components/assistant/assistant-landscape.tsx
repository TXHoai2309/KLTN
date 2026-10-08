/** Decorative line art, independent of chat state and free of text/DOM IDs. */
export function AssistantLandscape({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 900 240" fill="none" aria-hidden="true" focusable="false">
    <path d="M0 193 56 165 84 175 144 109 177 135 228 63 253 97 285 87 341 150 380 126 414 150 458 92 477 113 526 33 551 62 579 49 621 107 651 84 715 153 751 120 775 138 823 73 844 100 900 134V240H0Z" fill="currentColor" opacity=".09" />
    <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity=".5">
      <path d="m0 193 56-28 28 10 60-66 33 26 51-72 25 34 32-10 56 63 39-24 34 24 44-58 19 21 49-80 25 29 28-13 42 58 30-23 64 69 36-33 24 18 48-65 21 27 56 34" />
      <path d="m84 175 57-44 24 11 63-59 25 39 30-13 57 62m117-58 27 26 41-84 26 33 25-14 39 51 35-20 61 68m42-18 43-60 23 33 39 19" />
      <path d="m0 218 96-27 52-30 35 19 78-37 72 53 46-27 67 30 79-77 53 39 46-16 64 55 64-29 62 13 86-24" />
      <path d="M0 235c110-36 169-14 253-43s120 35 190 24 81-39 116-48c32-8 48 0 32 12-25 19-90 19-78 32 16 18 114 10 94 28" />
      <path d="M383 240c78-19 104-26 86-35-12-6-42-5-21-19l72-39m98 59c95-43 152-44 282-15m-269 26c97-42 152-41 269-17m-252 27c84-35 150-34 252-18m-225 28c85-28 142-28 225-18" />
    </g>
    <g stroke="currentColor" strokeWidth="2" opacity=".3">
      <path d="M117 198v-24m-9 12 9-17 9 17m-7 9 7-15 7 15M685 195v-27m-10 13 10-20 10 20m91 27v-25m-9 13 9-20 9 20M39 218v-20m-7 9 7-15 7 15" />
    </g>
  </svg>;
}
