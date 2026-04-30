"use client";

export function MapsLink({ location }: { location: string }) {
  const encoded = encodeURIComponent(location);
  // Fallback href — used by crawlers, right-click → open in tab, JS disabled
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !("MSStream" in window); // exclude IE11 on Windows Phone
    const url = isIOS
      ? `maps://maps.apple.com/?q=${encoded}` // opens Apple Maps on iPhone/iPad
      : googleUrl;                             // opens Google Maps on Android + desktop
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <a
      href={googleUrl}
      onClick={handleClick}
      className="text-sm text-[#667470] font-medium hover:underline flex items-center gap-1"
    >
      📍 {location}
    </a>
  );
}
