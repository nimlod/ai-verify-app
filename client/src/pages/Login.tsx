
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
export default function Login(){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [msg,setMsg]=useState<string>('')
  const signup = async()=>{
    setMsg('')
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error? `SignUp error: ${error.message}` : 'SignUp OK. Please verify email (if required).')
  }
  const signin = async()=>{
    setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMsg(error? `SignIn error: ${error.message}` : 'SignIn OK. Go to Dashboard.')
  }
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Supabase Login</h1>
      <div className="space-y-3">
        <Input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <Input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={signup}>Sign Up</Button>
          <Button variant="outline" onClick={signin}>Sign In</Button>
        </div>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </div>
    </div>
  )
}
