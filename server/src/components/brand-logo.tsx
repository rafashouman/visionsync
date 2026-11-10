import Image from "next/image"

export function BrandLogo({ size = "small" }: { size?: "big" | "small" }) {
  const big = size === "big"
  return <span className={`vs-brand-logo vs-brand-logo-${size}`} role="img" aria-label="VisionSync">
    <Image className="vs-brand-on-dark" src={`/brand/logo-${size}-${big ? "white" : "wh"}.png`} width={big ? 1169 : 351} height={big ? 170 : 51} alt="" loading={big ? "eager" : "lazy"} />
    <Image className="vs-brand-on-light" src={`/brand/logo-${size}-dark.png`} width={big ? 1169 : 351} height={big ? 170 : 51} alt="" loading={big ? "eager" : "lazy"} />
  </span>
}
