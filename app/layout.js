import "./globals.css";

export const metadata = {
  title: "Bars à vin de Paris",
  description:
    "Annuaire des bars à vin de Paris : notes, avis, horaires, adresses et contacts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
