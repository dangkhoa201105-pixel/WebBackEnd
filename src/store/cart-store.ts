import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Book } from "@/lib/books";
import type { RentalMode } from "@/lib/rental-pricing";

type CartItem = Book & { days: number };

type CartState = {
  items: CartItem[];
  rentalMode: RentalMode;
  addItem: (book: Book) => void;
  setRentalMode: (rentalMode: RentalMode) => void;
  removeItem: (id: string) => void;
  setDays: (id: string, days: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      rentalMode: "OFFLINE",
      addItem: (book) =>
        set((state) =>
          state.items.some((item) => item.id === book.id)
            ? state
            : { items: [...state.items, { ...book, days: 7 }] },
        ),
      setRentalMode: (rentalMode) => set({ rentalMode }),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      setDays: (id, days) =>
        set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, days } : item)) })),
      clear: () => set({ items: [] }),
    }),
    { name: "booknest-rental-cart-v2" },
  ),
);
