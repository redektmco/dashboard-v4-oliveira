import { Icon, type IconName } from "@/components/icon";

/**
 * Banner/capa da categoria. A empresa envia a arte pronta (upload no CMS);
 * aqui só a exibimos com proporção fixa e `object-fit: cover`, então nunca
 * distorce. Sem arte, cai num gradiente com o ícone da categoria — a área
 * fica sempre claramente definida, como o briefing pede.
 *
 * Usa <img loading="lazy"> de propósito: as capas são externas (Blob) e não
 * dependem de configuração de domínio do next/image, evitando acoplamento.
 */
export function CategoryBanner({
  bannerUrl,
  icon,
  children,
  className = "",
}: {
  bannerUrl: string | null;
  icon?: string | null;
  children?: React.ReactNode;
  className?: string;
}) {
  const isIconName = icon && icon.length <= 20 && /^[a-zA-Z]+$/.test(icon);
  return (
    <div className={`ob-banner ${className}`}>
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- capa externa (Vercel Blob), domínio dinâmico
        <img src={bannerUrl} alt="" loading="lazy" />
      ) : (
        <div className="ob-banner-fallback">
          {isIconName ? (
            <Icon name={icon as IconName} size={48} stroke={1.25} />
          ) : (
            <span className="font-display text-5xl">{icon || "V4"}</span>
          )}
        </div>
      )}
      {children && (
        <>
          <span className="ob-banner-veil" />
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">{children}</div>
        </>
      )}
    </div>
  );
}
