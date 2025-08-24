
import React from 'react'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline'|'ghost' }
export const Button: React.FC<Props> = ({ className='', variant='default', ...props }) => {
  const base = 'px-4 py-2 rounded-2xl shadow hover:shadow-md transition text-sm font-medium'
  const variants: Record<string,string> = {
    default: 'bg-black text-white',
    outline: 'border border-gray-300 bg-white',
    ghost: 'bg-transparent hover:bg-gray-100'
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
