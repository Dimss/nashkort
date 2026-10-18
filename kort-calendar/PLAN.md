# NashKort — Tennis Court Booking App

## Context

Building a new full-stack tennis court booking application from scratch. The directory is empty — we're starting from zero.

## Stack

- **Next.js 15** (App Router, Server Actions, TypeScript)
- **PostgreSQL** + **Prisma** ORM
- **Auth.js v5** (credentials provider, JWT sessions, role-based access)
- **Tailwind CSS** + **shadcn/ui** components
- **next-intl** (Russian + English, default: Russian)

## Database Schema

**User** — Auth.js-compatible with `role` (USER/ADMIN), `passwordHash`, `phone`

**Court** — `name`/`nameRu`, `description`/`descriptionRu`, `surface` (HARD/CLAY/GRASS/CARPET/ARTIFICIAL), `isIndoor`, `openTime`/`closeTime` (HH:mm strings), `slotMinutes`, `pricePerSlot`, `isActive`

**Booking** — `courtId`, `userId`, `date`, `startTime`/`endTime`, `status` (CONFIRMED/CANCELLED)

### Double-Booking Prevention (3 layers)

1. `@@unique([courtId, date, startTime])` — Prisma-level constraint
2. PostgreSQL exclusion constraint with `btree_gist` — prevents overlapping time ranges
3. Application-level overlap check before insert — provides friendly error messages

## Key Architecture Decisions

- **Server Actions** for all mutations (no REST API routes except Auth.js handler)
- **JWT sessions** (required by credentials provider with PrismaAdapter)
- **Bilingual court names** as separate DB fields (`name`/`nameRu`) — simple with only 2 languages
- **Route groups**: `(auth)` for login/register (minimal chrome), `(main)` for authenticated pages (header+footer)
- **Middleware** composes next-intl locale routing with Auth.js auth

## Project Structure

```
nashkort/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── messages/
│   ├── en.json
│   └── ru.json
├── src/
│   ├── auth.ts                    # Auth.js full config (with PrismaAdapter)
│   ├── auth.config.ts             # Auth.js edge-compatible config
│   ├── middleware.ts              # next-intl + Auth.js composed middleware
│   ├── i18n/
│   │   ├── routing.ts            # Locales config + navigation helpers
│   │   └── request.ts            # getRequestConfig
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx        # Root layout (providers)
│   │   │   ├── page.tsx          # Landing page
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (main)/
│   │   │   │   ├── layout.tsx    # Header + footer
│   │   │   │   ├── courts/
│   │   │   │   │   ├── page.tsx          # Courts listing
│   │   │   │   │   └── [courtId]/page.tsx # Court detail + booking
│   │   │   │   ├── bookings/page.tsx      # My bookings
│   │   │   │   └── profile/page.tsx       # User profile
│   │   │   └── admin/
│   │   │       ├── layout.tsx    # Admin sidebar + role guard
│   │   │       ├── page.tsx      # Dashboard stats
│   │   │       ├── courts/       # CRUD courts
│   │   │       ├── bookings/page.tsx # All bookings table
│   │   │       └── users/page.tsx    # User management
│   │   └── api/auth/[...nextauth]/route.ts
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── layout/               # header, footer, admin-sidebar, locale-switcher
│   │   ├── auth/                 # login-form, register-form, user-button
│   │   ├── courts/               # court-card, court-details, court-form
│   │   ├── booking/              # booking-calendar, time-slot-grid, booking-dialog
│   │   └── admin/                # stats-cards, bookings-table, users-table
│   ├── actions/
│   │   ├── auth.ts               # registerUser
│   │   ├── courts.ts             # getCourts, createCourt, updateCourt, toggleActive
│   │   ├── bookings.ts           # getAvailableSlots, createBooking, cancelBooking, getUserBookings
│   │   ├── users.ts              # updateProfile, changePassword
│   │   └── admin.ts              # getUsers, setUserRole, getDashboardStats, getAllBookings
│   ├── lib/
│   │   ├── db.ts                 # Prisma client singleton
│   │   ├── utils.ts              # cn() and helpers
│   │   └── constants.ts          # Business rules (cancellation deadline, etc.)
│   └── types/
│       └── index.ts              # TypeScript types + Auth.js augmentations
```

## Route Map

| Path | Access | Purpose |
|---|---|---|
| `/[locale]` | Public | Landing page |
| `/[locale]/login` | Public | Login |
| `/[locale]/register` | Public | Registration |
| `/[locale]/courts` | Public | Courts listing |
| `/[locale]/courts/[id]` | Auth | Court detail + booking calendar |
| `/[locale]/bookings` | Auth | My bookings |
| `/[locale]/profile` | Auth | User profile |
| `/[locale]/admin` | Admin | Dashboard with stats |
| `/[locale]/admin/courts` | Admin | CRUD courts |
| `/[locale]/admin/courts/new` | Admin | Create court |
| `/[locale]/admin/courts/[id]/edit` | Admin | Edit court |
| `/[locale]/admin/bookings` | Admin | All bookings table with filters |
| `/[locale]/admin/users` | Admin | User management + role assignment |

## Server Actions

### Auth (`src/actions/auth.ts`)
- `registerUser({ name, email, password, phone? })` — hash password, create user, auto-login

### Courts (`src/actions/courts.ts`)
- `getCourts({ activeOnly? })` — list courts (public)
- `getCourtById({ courtId })` — single court (public)
- `createCourt(data)` — admin only
- `updateCourt({ courtId, data })` — admin only
- `toggleCourtActive({ courtId })` — admin only

### Bookings (`src/actions/bookings.ts`)
- `getAvailableSlots({ courtId, date })` — compute slots from court hours minus existing bookings
- `createBooking({ courtId, date, startTime, endTime })` — with overlap check
- `cancelBooking({ bookingId })` — user cancels own, admin cancels any
- `getUserBookings({ status? })` — current user's bookings

### Admin (`src/actions/admin.ts`)
- `getAllBookings({ courtId?, date?, status?, page, pageSize })` — paginated + filtered
- `getUsers({ search?, role?, page, pageSize })` — user list
- `setUserRole({ userId, role })` — promote/demote
- `getDashboardStats()` — aggregate counts + revenue

## Booking Flow

1. **Browse courts** → `/courts` shows active courts as cards
2. **Select court** → `/courts/[id]` shows detail + week calendar
3. **Pick date** → calendar fetches available slots via `getAvailableSlots`
4. **Pick time slot** → `TimeSlotGrid` shows slots as available/booked/past
5. **Confirm** → `BookingDialog` shows summary, calls `createBooking`
6. **Result** → success toast + calendar refresh via `revalidatePath`

## Implementation Phases

### Phase 1: Scaffolding + Auth + i18n
- `create-next-app`, install all dependencies
- Prisma schema (User + Auth.js models), initial migration, seed admin user
- Auth.js v5 config (credentials, JWT callbacks with id/role, type augmentations)
- next-intl setup (routing, request config, middleware composition, initial translations)
- Root layout with providers, login/register pages, header with nav + locale switcher

### Phase 2: Courts + Admin Layout
- Add Court model, migration, seed sample courts
- Court server actions (CRUD)
- Admin layout with sidebar, admin courts pages (list, create, edit)
- Public courts listing, court detail page
- Courts translations (both languages)

### Phase 3: Booking System
- Add Booking model, migration + exclusion constraint (raw SQL)
- Booking server actions (available slots, create, cancel, user list)
- `BookingCalendar` + `TimeSlotGrid` + `BookingDialog` components
- "My Bookings" page with tabs (upcoming/past/cancelled)

### Phase 4: Admin Panel Completion
- Dashboard stats, bookings data table, users data table
- Admin booking cancellation, user role management
- Admin translations

### Phase 5: Polish
- Toast notifications (sonner), loading skeletons, responsive design
- Profile page (edit name/phone, change password)
- Cancellation policy (configurable deadline), past-date guards
- SEO metadata, empty states
- `.env.example`, docker-compose.yml for local PostgreSQL

## Dependencies

```
next, react, react-dom
next-auth@beta, @auth/prisma-adapter, @prisma/client, prisma
next-intl
bcryptjs, @types/bcryptjs
zod, react-hook-form, @hookform/resolvers
date-fns
sonner
tailwindcss, @tailwindcss/postcss
shadcn/ui components
```

## Verification Checklist

- [ ] `npm run dev` starts without errors
- [ ] Register new user → login → switch RU/EN — auth works
- [ ] Admin login (seeded) → create court → appears on public listing
- [ ] User browses courts → picks date → books slot → appears in "My Bookings"
- [ ] Double-booking same slot → rejected with error
- [ ] Cancel booking → slot becomes available again
- [ ] Admin dashboard → correct stats, manage bookings/users
- [ ] All pages render correctly in both Russian and English
