import './marquee.css'

type Props = {
  items: string[]
  speed?: number
  reverse?: boolean
}

/** Faixa em rolagem contínua, usada para os rótulos curtos do produto. */
export function Marquee({ items, speed = 38, reverse = false }: Props) {
  const doubled = [...items, ...items]

  return (
    <div className="marquee" aria-hidden="true">
      <div
        className="marquee__track"
        style={{
          animationDuration: `${speed}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {doubled.map((item, i) => (
          <span className="marquee__item" key={i}>
            {item}
            <span className="marquee__sep" />
          </span>
        ))}
      </div>
    </div>
  )
}
