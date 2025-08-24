
import React from 'react'
export const Card: React.FC<{className?:string, children: React.ReactNode}> = ({ className='', children }) => (
  <div className={`rounded-2xl bg-white shadow p-4 ${className}`}>{children}</div>
)
export const CardTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
  <h2 className="text-lg font-semibold mb-2">{children}</h2>
)
export const CardDesc: React.FC<{children: React.ReactNode}> = ({children}) => (
  <p className="text-sm text-gray-600 mb-2">{children}</p>
)
