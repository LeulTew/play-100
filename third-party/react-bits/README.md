# React Bits attribution

Upstream: https://github.com/DavidHDev/react-bits  
Project: https://reactbits.dev  
Revision: `3a1c7f2f9f94ed833934ab5c2635760b9e644583`  
Copyright (c) 2026 David Haz

The exact retrieved source files and upstream `LICENSE.md` are kept beside this
notice. Use is as part of the Play 100 website, not as a redistributed component
library. The full MIT + Commons Clause notice is also served publicly from
`public\licenses\react-bits.txt`.

| Original | Website derivative | Purpose and changes |
| --- | --- | --- |
| `TextAnimations/CountUp/CountUp.tsx` | `src\components\bits\CountUp.tsx` | Springs private-list count changes. Initializes with real content, provides stable screen-reader text and jumps immediately in Lite/reduced/hidden modes. |
| `Animations/Magnet/Magnet.tsx` | `src\components\bits\Magnet.tsx` | Small tactile displacement on one optional game-picking action. Listeners are element-local, offsets bounded, keyboard focus stationary, coarse-pointer/reduced motion disabled. |
| `Animations/AnimatedContent/AnimatedContent.tsx` | `src\components\bits\AnimatedContent.tsx` | A single clipped print-like workbook entrance. Replaces the GSAP/ScrollTrigger engine with native Web Animations and IntersectionObserver, avoids hidden-by-default content and stops hidden-tab work. |

The app imports only its three customized derivatives. It does not import the
React Bits catalog or retain unused GSAP code in its production bundle.
