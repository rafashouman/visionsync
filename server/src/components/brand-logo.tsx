import Image from "next/image"
import { brandSrc } from "@/lib/brand"

export function BrandLogo({ size = "small" }: { size?: "big" | "small" }) {
  const big = size === "big"
  return <span className={`vs-brand-logo vs-brand-logo-${size}`} role="img" aria-label="VisionSync">
    <Image className="vs-brand-on-dark" src={brandSrc(`/brand/logo-${size}-${big ? "white" : "wh"}.png`)} width={big ? 1169 : 351} height={big ? 170 : 51} alt="" loading={big ? "eager" : "lazy"} />
    <Image className="vs-brand-on-light" src={brandSrc(`/brand/logo-${size}-dark.png`)} width={big ? 1169 : 351} height={big ? 170 : 51} alt="" loading={big ? "eager" : "lazy"} />
  </span>
}
