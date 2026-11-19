--!strict
-- Reusable hammer destruction system. ModuleScript; Director requires it as a child.
-- Only parts tagged Attribute Breakable=true on the slab ever move. Everything temporary lives in one
-- folder (M.Temp) so Cleanup() is a single call. Tune via M.Config (read at call time, so live-editable).
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local M = {}

M.Config = {
	ImpactStrength = 1.0, -- scales dust, chip speed, rubble speed, shockwave size
	DebrisCount = 1.0, -- scales chip / fragment counts
	CleanupDelay = 4.0, -- seconds before loose chips and rubble are removed
}

local rng = Random.new(7) -- fixed seed so every take looks the same
local origin: { [BasePart]: CFrame } = {}

M.Temp = Instance.new("Folder")
M.Temp.Name = "HammerTemp"
M.Temp.Parent = workspace

local function concrete(size: Vector3, cf: CFrame, shade: number?): Part
	local p = Instance.new("Part")
	p.Size, p.CFrame = size, cf
	p.Material = Enum.Material.Concrete
	local g = shade or rng:NextInteger(120, 150)
	p.Color = Color3.fromRGB(g, g, g)
	p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
	return p
end

-- Build the slab: cols x rows grid of cells. Centre columns below `lintelRows` are Breakable; the outer
-- columns and the top lintel rows stay standing so the opening is easy to read.
function M.BuildSlab(center: Vector3, cols: number, rows: number, cell: Vector3, lintelRows: number): Model
	local slab = Instance.new("Model")
	slab.Name = "Slab"
	local lo, hi = math.ceil(cols / 2) - 1, math.ceil(cols / 2) + 1 -- three centre columns
	for c = 1, cols do
		for r = 1, rows do
			local x = center.X + (c - (cols + 1) / 2) * cell.X
			local y = (r - 0.5) * cell.Y
			local p = concrete(cell - Vector3.new(0.04, 0.04, 0), CFrame.new(x, y, center.Z))
			p.Anchored = true
			p.Name = ("Cell_%d_%d"):format(c, r)
			p:SetAttribute("Breakable", c >= lo and c <= hi and r <= rows - lintelRows)
			p.Parent = slab
			origin[p] = p.CFrame
		end
	end
	slab.Parent = workspace
	return slab
end

function M.Breakables(slab: Model): { BasePart }
	local out = {}
	for _, p in slab:GetChildren() do
		if p:IsA("BasePart") and p:GetAttribute("Breakable") then
			table.insert(out, p)
		end
	end
	return out
end

local function emitter(parent: Instance, count: number, size: number, speed: number, tint: number)
	local e = Instance.new("ParticleEmitter")
	e.Texture = "rbxasset://textures/particles/smoke_main.dds"
	e.Rate = 0
	e.Lifetime = NumberRange.new(0.7, 1.3)
	e.Speed = NumberRange.new(speed * 0.5, speed)
	e.SpreadAngle = Vector2.new(70, 70)
	e.Drag = 3
	e.Acceleration = Vector3.new(0, 1.5, 0)
	e.Color = ColorSequence.new(Color3.fromRGB(tint, tint, tint))
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size * 0.5), NumberSequenceKeypoint.new(1, size) })
	e.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.55),
		NumberSequenceKeypoint.new(1, 1),
	})
	e.LightEmission = 0
	e.Parent = parent
	e:Emit(math.max(1, math.floor(count)))
end

local function anchorPart(pos: Vector3): Part
	local a = Instance.new("Part")
	a.Anchored, a.CanCollide, a.CanQuery, a.Transparency = true, false, false, 1
	a.Size, a.Position = Vector3.one * 0.2, pos
	a.Parent = M.Temp
	Debris:AddItem(a, 3)
	return a
end

-- Compact dust burst at the contact point. `scale` ~0.4 tap, 1 hit, 1.4 smash.
function M.Dust(pos: Vector3, scale: number)
	local s = scale * M.Config.ImpactStrength
	emitter(anchorPart(pos), 14 * s, 1.6 + s, 5 * s, 170)
end

-- Loose chips thrown from `pos`. dir is the strike direction (unit). Persist until Cleanup/CleanupDelay.
function M.Chips(pos: Vector3, dir: Vector3, n: number, persistent: boolean?)
	n = math.max(1, math.floor(n * M.Config.DebrisCount))
	for _ = 1, n do
		local s = rng:NextNumber(0.12, 0.3)
		local p = concrete(Vector3.new(s, s * 0.8, s), CFrame.new(pos) * CFrame.Angles(rng:NextNumber(0, 6), rng:NextNumber(0, 6), 0))
		p.Name = "Chip"
		p.CanCollide = true
		p.CustomPhysicalProperties = PhysicalProperties.new(2, 0.8, 0.1)
		p.AssemblyLinearVelocity = (dir * rng:NextNumber(1, 3) + Vector3.new(rng:NextNumber(-2, 2), rng:NextNumber(1, 3), rng:NextNumber(-2, 2)))
			* M.Config.ImpactStrength
		p.Parent = M.Temp
		if not persistent then
			Debris:AddItem(p, M.Config.CleanupDelay)
		end
	end
end

-- Restrained ring that expands along the floor and fades.
function M.Shockwave(pos: Vector3, scale: number)
	local ring = Instance.new("Part")
	ring.Shape = Enum.PartType.Cylinder
	ring.Anchored, ring.CanCollide, ring.CanQuery = true, false, false
	ring.Material, ring.Color, ring.Transparency = Enum.Material.SmoothPlastic, Color3.fromRGB(235, 235, 235), 0.55
	ring.Size = Vector3.new(0.06, 1, 1)
	ring.CFrame = CFrame.new(pos.X, 0.05, pos.Z) * CFrame.Angles(0, 0, math.rad(90))
	ring.Parent = M.Temp
	local d = 9 * scale * M.Config.ImpactStrength
	local tw = TweenService:Create(ring, TweenInfo.new(0.55, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.06, d, d),
		Transparency = 1,
	})
	tw:Play()
	Debris:AddItem(ring, 0.8)
end

-- Cracks radiate from `point` across the slab's front face (faceZ). If instant, no growth animation.
function M.Cracks(point: Vector3, faceZ: number, instant: boolean?)
	local n = 7
	for i = 1, n do
		local ang = (i / n) * math.pi * 2 + rng:NextNumber(-0.25, 0.25)
		local len = rng:NextNumber(1.3, 2.6)
		local dir = Vector3.new(math.cos(ang), math.sin(ang), 0)
		local mid = Vector3.new(point.X, point.Y, faceZ - 0.012)
		local function at(l: number): CFrame
			return CFrame.new(mid + dir * l / 2) * CFrame.Angles(0, 0, ang)
		end
		local c = Instance.new("Part")
		c.Name = "Crack"
		c.Anchored, c.CanCollide, c.CanQuery = true, false, false
		c.Material, c.Color = Enum.Material.SmoothPlastic, Color3.fromRGB(35, 35, 38)
		c.Size = Vector3.new(instant and len or 0.05, 0.07, 0.02)
		c.CFrame = at(instant and len or 0.05)
		c.Parent = M.Temp
		if not instant then
			-- Size/CFrame both tween; ponytail: straight cracks, no branching (add forks if a closeup needs them).
			TweenService:Create(c, TweenInfo.new(rng:NextNumber(0.35, 0.6), Enum.EasingStyle.Quad), {
				Size = Vector3.new(len, 0.07, 0.02),
				CFrame = at(len),
			}):Play()
		end
	end
end

-- Break the designated sections away from `point` in direction `dir`. Only Breakable parts are touched.
function M.Break(slab: Model, point: Vector3, dir: Vector3, scale: number)
	local k = M.Config.ImpactStrength * scale
	for _, c in M.Temp:GetChildren() do -- cracks lived on the sections that are about to leave
		if c.Name == "Crack" then
			c:Destroy()
		end
	end
	for _, p in M.Breakables(slab) do
		local away = (p.Position - point)
		-- Shrink a little so freed chunks can't wedge against the anchored outer columns or lintel.
		if not p:GetAttribute("Shrunk") then
			p.Size -= Vector3.new(0.14, 0.14, 0.1)
			p:SetAttribute("Shrunk", true)
		end
		p.Anchored = false
		p.CanCollide = true
		p.CustomPhysicalProperties = PhysicalProperties.new(3, 0.45, 0.05)
		-- Pieces nearest the contact point leave fastest so the hole reads as punched from the centre.
		local near = math.clamp(1 - away.Magnitude / 6, 0.8, 1)
		-- Roblox gravity is 196 studs/s^2: chunks need real lift and ~16-22 studs/s to clear the opening.
		-- That lands them ~4-6 studs behind the slab, visible through the hole as rubble.
		p.AssemblyLinearVelocity = dir * (16 + rng:NextNumber(0, 6)) * k * near + Vector3.new(0, rng:NextNumber(5, 10) * k, 0)
		p.AssemblyAngularVelocity = Vector3.new(rng:NextNumber(-4, 4), rng:NextNumber(-2, 2), rng:NextNumber(-4, 4))
	end
	-- Smaller fragments for detail; count is adjustable and they never need to hide the action.
	M.Chips(point, dir, 22, false)
	M.Dust(point, 1.4 * scale)
	task.delay(0.25, function()
		M.Dust(point + dir * 1.5 - Vector3.new(0, point.Y - 0.6, 0), 1.0 * scale)
	end)
	-- Rubble pieces are removed only after the cleanup delay (the shot is over by then).
end

-- Put every breakable back where it started and remove cracks / chips / effects.
function M.Reset(slab: Model)
	for p, cf in origin do
		if p.Parent == slab then
			if p:GetAttribute("Shrunk") then
				p.Size += Vector3.new(0.14, 0.14, 0.1)
				p:SetAttribute("Shrunk", nil)
			end
			p.Anchored = true
			p.AssemblyLinearVelocity, p.AssemblyAngularVelocity = Vector3.zero, Vector3.zero
			p.CFrame = cf
		end
	end
	M.Temp:ClearAllChildren()
end

-- Remove loose rubble and effects after the shot, leaving the (broken) slab as the final state.
function M.Cleanup(slab: Model)
	M.Temp:ClearAllChildren()
	for _, p in M.Breakables(slab) do
		if not p.Anchored then
			p:Destroy()
		end
	end
end

return M
