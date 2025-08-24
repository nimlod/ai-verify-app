
import React from 'react'
import Dashboard from './Dashboard'
export default function PublicCheck(){
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Public Check</h1>
      <p className="text-sm text-gray-600 mb-4">承認済みの完成動画かを、誰でも照合できます。</p>
      <Dashboard />
    </div>
  )
}
