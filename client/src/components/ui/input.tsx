
import React from 'react'
type Props = React.InputHTMLAttributes<HTMLInputElement>
export const Input: React.FC<Props> = ({ className='', ...props }) => (
  <input className={`w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400 ${className}`} {...props} />
)
