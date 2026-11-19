--!strict
-- LocalScript: put in StarterPlayer > StarterPlayerScripts with HammerDestruction (ModuleScript) as its child.
-- Press Play, then start tools/record.ps1. Everything is built client-side, so nothing saves into the place.
-- Prints "[FILM] <mark> <seconds since the white sync flash>" at every hammer contact.
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local HD = require(script:WaitForChild("HammerDestruction"))

-- ===== tune here (also live-editable on HD.Config) =====
HD.Config.ImpactStrength = 1.0
HD.Config.DebrisCount = 1.0
HD.Config.CleanupDelay = 8.0 -- longer than the 5.4 s hold after the smash, so nothing pops out on camera
local CONTACT = { tap = 3.0, hit1 = 11.0, hit2 = 19.0, smash = 29.0 } -- game seconds after the sync flash
local THETA_HIT = 2.1 -- shoulder angle at contact (arm up-forward, hammer travelling down-forward)
local REST = 0.85 -- resting pose: sledge head grounded in front of the feet
-- Recorded 16:9, centre-cropped to 9:16 (~29 deg of horizontal view). Look point sits low so the action
-- lands in the upper part of the frame, above the ForgeGUI panel (y 1200+) and subtitles (y 1132).
-- Camera sits on the hammer-arm side (-X) so the swing is never hidden behind the body.
local CAMERA_POS, CAMERA_LOOK, FOV = Vector3.new(-20, 8.4, -16.5), Vector3.new(0.3, 0.6, -0.8), 50
-- =======================================================

local SLAB_Z, SLAB_T = 0, 1.6
local FACE_Z = SLAB_Z - SLAB_T / 2

-- ---------- scene ----------
Lighting.ClockTime, Lighting.Brightness = 14, 2
Lighting.Ambient, Lighting.OutdoorAmbient = Color3.fromRGB(110, 110, 112), Color3.fromRGB(120, 120, 122)

local scene = Instance.new("Folder")
scene.Name = "DemolitionBay"
scene.Parent = workspace

local function box(name: string, size: Vector3, cf: CFrame, color: Color3, mat: Enum.Material): Part
	local p = Instance.new("Part")
	p.Name, p.Size, p.CFrame, p.Color, p.Material = name, size, cf, color, mat
	p.Anchored = true
	p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
	p.Parent = scene
	return p
end

box("Floor", Vector3.new(40, 1, 40), CFrame.new(0, -0.5, 0), Color3.fromRGB(150, 150, 150), Enum.Material.Concrete)
box("BackWall", Vector3.new(40, 16, 1), CFrame.new(0, 8, 9), Color3.fromRGB(120, 122, 126), Enum.Material.Concrete)
local yellow = Color3.fromRGB(240, 190, 20)
for _, s in { { 14, 0.4, 0, -6.5 }, { 14, 0.4, 0, 3 }, { 0.4, 9.4, -7, -1.75 }, { 0.4, 9.4, 7, -1.75 } } do
	box("Hazard", Vector3.new(s[1], 0.06, s[2]), CFrame.new(s[3], 0.03, s[4]), yellow, Enum.Material.SmoothPlastic)
end
for i = 0, 5 do -- diagonal hazard bars along the back edge
	box("HazardBar", Vector3.new(0.5, 0.06, 2), CFrame.new(-5 + i * 2, 0.03, 5.5) * CFrame.Angles(0, math.rad(40), 0), yellow, Enum.Material.SmoothPlastic)
end
for _, x in { -6.2, 6.4 } do -- two barrels, restrained
	local b = box("Barrel", Vector3.new(3, 2.2, 2.2), CFrame.new(x, 1.5, 6.3) * CFrame.Angles(0, 0, math.rad(90)), Color3.fromRGB(70, 90, 110), Enum.Material.Metal)
	b.Shape = Enum.PartType.Cylinder
	b.Size = Vector3.new(3, 2.2, 2.2)
end

-- ---------- character + hammer ----------
local desc = Instance.new("HumanoidDescription")
local skin = Color3.fromRGB(234, 184, 146)
desc.HeadColor, desc.LeftArmColor, desc.RightArmColor = skin, skin, skin
desc.TorsoColor = Color3.fromRGB(240, 130, 40) -- hi-vis orange
desc.LeftLegColor, desc.RightLegColor = Color3.fromRGB(50, 70, 110), Color3.fromRGB(50, 70, 110)
local rig = Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
rig.Name = "Demolisher"
rig.Parent = scene
local hum = rig:WaitForChild("Humanoid") :: Humanoid
local root = rig:WaitForChild("HumanoidRootPart") :: BasePart
local hand = rig:WaitForChild("RightHand") :: BasePart
local lHand = rig:WaitForChild("LeftHand") :: BasePart
local rSh = (rig:WaitForChild("RightUpperArm") :: BasePart):WaitForChild("RightShoulder") :: Motor6D
local lSh = (rig:WaitForChild("LeftUpperArm") :: BasePart):WaitForChild("LeftShoulder") :: Motor6D
root.Anchored = true
hum.PlatformStand = true
local an = hum:FindFirstChildOfClass("Animator") if an then an:Destroy() end

local hammer = Instance.new("Model")
hammer.Name = "Hammer"
local handle = Instance.new("Part")
handle.Name, handle.Size, handle.Material, handle.Color = "Handle", Vector3.new(0.3, 2.4, 0.3), Enum.Material.Wood, Color3.fromRGB(120, 80, 45)
local head = Instance.new("Part")
head.Name, head.Size, head.Material, head.Color = "Head", Vector3.new(0.9, 0.9, 1.9), Enum.Material.Metal, Color3.fromRGB(60, 62, 66)
for _, p in { handle, head } do
	p.Massless, p.CanCollide = true, false
	p.Parent = hammer
end
local function weld(a: BasePart, b: BasePart, c0: CFrame)
	local w = Instance.new("Weld")
	w.Part0, w.Part1, w.C0 = a, b, c0
	w.Parent = b
end
hammer.Parent = rig
weld(hand, handle, CFrame.new(0, -0.7, 0))
weld(handle, head, CFrame.new(0, -1.35, 0))

local armTheta = 0
local function setArm(theta: number)
	armTheta = theta
	rSh.Transform = CFrame.Angles(theta, 0, 0)
	lSh.Transform = CFrame.Angles(theta, 0, 0)
	-- Left hand follows the grip so both hands stay on the handle.
end

-- Place the character so the head's leading edge touches the slab face at THETA_HIT; return contact height.
-- Character stands at z=-6 facing +Z toward the slab (rotated 180deg from the default -Z).
root.CFrame = CFrame.new(0, hum.HipHeight + root.Size.Y / 2, -6) * CFrame.Angles(0, math.pi, 0)
setArm(THETA_HIT)
for _ = 1, 3 do -- Motor6D.Transform only moves the parts on the next step
	RunService.Heartbeat:Wait()
end
local hs = head.Size / 2
local maxZ, tipY = -math.huge, 0
for sx = -1, 1, 2 do
	for sy = -1, 1, 2 do
		for sz = -1, 1, 2 do
			local w = head.CFrame:PointToWorldSpace(Vector3.new(sx * hs.X, sy * hs.Y, sz * hs.Z))
			if w.Z > maxZ then
				maxZ, tipY = w.Z, w.Y
			end
		end
	end
end
-- The hammer is in the right hand (world -X when facing +Z): slide sideways so the head lands on x=0.
root.CFrame = root.CFrame + Vector3.new(-head.Position.X, 0, FACE_Z - 0.03 - maxZ)
local contact = Vector3.new(0, tipY, FACE_Z)
setArm(REST)

-- ---------- slab (built around the measured contact height so the opening reaches the floor) ----------
local CELL = Vector3.new(1.3, 1.25, SLAB_T)
local rows = math.max(7, math.ceil((tipY + 0.7) / CELL.Y) + 2) -- opening rows + 2-row lintel; taller than the character
local slab = HD.BuildSlab(Vector3.new(0, 0, SLAB_Z), 5, rows, CELL, 2)

-- ---------- camera ----------
if not game:IsLoaded() then
	game.Loaded:Wait()
end
game:GetService("StarterGui"):SetCoreGuiEnabled(Enum.CoreGuiType.All, false)
hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
-- The viewer's own avatar spawns at the origin (inside the slab): park it far away, anchored.
local me = Players.LocalPlayer.Character or Players.LocalPlayer.CharacterAdded:Wait()
local myRoot = me:WaitForChild("HumanoidRootPart") :: BasePart
myRoot.Anchored = true
me:PivotTo(CFrame.new(0, 400, 0))
task.wait(2) -- let the client settle so the first take is on time
local cam = workspace.CurrentCamera
cam.FieldOfView = FOV
local baseCF = CFrame.lookAt(CAMERA_POS, CAMERA_LOOK)
cam.CFrame = baseCF
local shakeUntil, shakeAmp = 0, 0
RunService.RenderStepped:Connect(function()
	cam.CameraType = Enum.CameraType.Scriptable
	local t = os.clock()
	if t < shakeUntil then
		local k = (shakeUntil - t) / 0.25 * shakeAmp
		cam.CFrame = baseCF * CFrame.new(math.sin(t * 90) * k, math.cos(t * 70) * k, 0)
	else
		cam.CFrame = baseCF
	end
end)
local function shake(amp: number)
	shakeAmp, shakeUntil = amp * HD.Config.ImpactStrength, os.clock() + 0.25 -- one brief, subtle shake
end

-- ---------- animation ----------
local function tweenArm(to: number, dur: number, style: Enum.EasingStyle, dir: Enum.EasingDirection)
	local v = Instance.new("NumberValue")
	v.Value = armTheta
	local c = v.Changed:Connect(setArm)
	local tw = TweenService:Create(v, TweenInfo.new(dur, style, dir), { Value = to })
	tw:Play()
	tw.Completed:Wait()
	c:Disconnect()
	v:Destroy()
	setArm(to)
end

local t0 = os.clock()
local function mark(name: string)
	print(string.format("[FILM] %s %.3f", name, os.clock() - t0))
end
local function waitUntil(t: number)
	local d = t - (os.clock() - t0)
	if d > 0 then
		task.wait(d)
	end
end

-- One swing. contactAt is game seconds after the flash; wind/hold set the wind-up and pause before the swing.
local function strike(name: string, contactAt: number, windTheta: number, wind: number, hold: number, onContact: () -> ())
	local swing = 0.12
	waitUntil(contactAt - swing - hold - wind)
	tweenArm(windTheta, wind, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	task.wait(hold)
	local done = false
	task.spawn(function()
		tweenArm(THETA_HIT, swing, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		done = true
	end)
	while not done do
		task.wait()
	end
	mark(name)
	onContact()
	task.wait(0.15) -- forceful stop: hold the pose at contact
	tweenArm(REST, 0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.Out)
end

-- ---------- run ----------
HD.Reset(slab)
setArm(REST)
local flash = Instance.new("ScreenGui")
flash.IgnoreGuiInset, flash.ResetOnSpawn = true, false
local fr = Instance.new("Frame")
fr.Size, fr.BackgroundColor3, fr.BorderSizePixel = UDim2.fromScale(1, 1), Color3.new(1, 1, 1), 0
fr.Parent = flash
task.wait(1.5) -- scene visible and steady before the sync flash
flash.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
t0 = os.clock()
task.delay(0.4, function()
	flash:Destroy()
end)

local DIR = Vector3.new(0, 0, 1)

-- 1. weak tap: small dry tink, nothing breaks
strike("tap", CONTACT.tap, 2.5, 0.55, 0.1, function()
	HD.Chips(contact, DIR, 2, true)
end)

-- 2. heavy impact + dust, slab intact
strike("hit1", CONTACT.hit1, 3.5, 0.9, 0.25, function()
	HD.Dust(contact, 1.0)
	HD.Chips(contact, DIR, 5, true)
end)

-- 3. spreading cracks + shockwave, a few pieces fall, one subtle shake
strike("hit2", CONTACT.hit2, 3.5, 0.9, 0.3, function()
	HD.Dust(contact, 1.1)
	HD.Cracks(contact, FACE_Z, false)
	HD.Shockwave(Vector3.new(0, 0, FACE_Z), 1.0)
	HD.Chips(contact + Vector3.new(0, 0.3, 0.4), Vector3.new(0, -0.3, -0.2), 6, true)
	shake(0.07)
end)

-- 4. final smash: cracks already present (they persist from take 3), raise, pause, break the centre
strike("smash", CONTACT.smash, 3.6, 2.0, 1.4, function()
	HD.Dust(contact, 1.5)
	HD.Shockwave(Vector3.new(0, 0, FACE_Z), 1.2)
	HD.Break(slab, contact, DIR, 1.0)
	shake(0.1)
end)

task.wait(HD.Config.CleanupDelay + 3)
HD.Cleanup(slab) -- loose rubble and effects go; the outer sections and lintel stay
