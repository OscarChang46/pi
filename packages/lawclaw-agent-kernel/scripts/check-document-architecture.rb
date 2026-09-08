#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"
require "pathname"

project_root = Pathname.new(__dir__).parent
docs_root = project_root.join("docs")
manifest_path = docs_root.join("design/document-manifest.yaml")
manifest = YAML.safe_load(manifest_path.read, aliases: false)
required_metadata = manifest.fetch("required_metadata")

expected = {}
register = lambda do |doc_id, relative_path|
  abort("错误：文档清单重复 ID：#{doc_id}") if expected.key?(doc_id)
  expected[doc_id] = relative_path
end

root_entry = manifest.fetch("root_document")
register.call(root_entry.fetch("doc_id"), root_entry.fetch("path"))

layers = manifest.fetch("layers")
abort("错误：C4 层设计必须恰好为 7 个。") unless layers.length == 7
layers.each do |layer|
  register.call(layer.fetch("doc_id"), layer.fetch("path"))
  diagram = project_root.join(layer.fetch("diagram"))
  abort("错误：缺少层级 C4 图：#{diagram}") unless diagram.file?
  layer.fetch("components").each { |id, path| register.call(id, path) }
end

manifest.fetch("document_sets").each_value do |set|
  root = project_root.join(set.fetch("root"))
  discovered = Dir.glob(root.join("**/*.md")).sort
  discovered.each do |path|
    text = File.read(path)
    match = text.match(/\A---\s*\n(.*?)\n---\s*\n/m)
    abort("错误：缺少 YAML front matter：#{path}") unless match
    metadata = YAML.safe_load(match[1], aliases: false)
    register.call(metadata.fetch("doc_id"), Pathname.new(path).relative_path_from(project_root).to_s)
  end
  missing_ids = set.fetch("required_ids") - expected.keys
  abort("错误：文档集合缺少 ID：#{missing_ids.join(', ')}") unless missing_ids.empty?
end

metadata_by_id = {}
expected.each do |expected_id, relative_path|
  path = project_root.join(relative_path)
  abort("错误：文档清单路径不存在：#{relative_path}") unless path.file?
  match = path.read.match(/\A---\s*\n(.*?)\n---\s*\n/m)
  abort("错误：缺少 YAML front matter：#{relative_path}") unless match
  metadata = YAML.safe_load(match[1], aliases: false)
  missing_fields = required_metadata.reject { |field| metadata.key?(field) }
  abort("错误：#{relative_path} 缺少元数据：#{missing_fields.join(', ')}") unless missing_fields.empty?
  abort("错误：清单 ID #{expected_id} 与文件 ID #{metadata['doc_id']} 不一致：#{relative_path}") unless metadata["doc_id"] == expected_id
  abort("错误：#{relative_path} 使用了错误候选基线：#{metadata['baseline']}") unless metadata["baseline"] == manifest.fetch("candidate_baseline")
  metadata_by_id[expected_id] = metadata
end

metadata_by_id.each do |doc_id, metadata|
  parent = metadata["parent"]
  next if doc_id == root_entry.fetch("doc_id") && parent.nil?
  abort("错误：#{doc_id} 缺少有效 parent：#{parent.inspect}") unless metadata_by_id.key?(parent)
end

layers.each do |layer|
  layer_path = project_root.join(layer.fetch("path"))
  layer.fetch("components").each do |component_id, component_path|
    expected_parent = layer.fetch("doc_id")
    actual_parent = metadata_by_id.fetch(component_id).fetch("parent")
    abort("错误：#{component_id} 的 parent 应为 #{expected_parent}，实际为 #{actual_parent}") unless actual_parent == expected_parent
    relative_link = Pathname.new(component_path).relative_path_from(Pathname.new(layer.fetch("path")).dirname).to_s
    abort("错误：层设计未导航到组件 #{component_id}：#{relative_link}") unless layer_path.read.include?(relative_link)
  end
end

deprecated_names = %w[
  agent-registry-routing-subsystem-design.md
  c4-boundary-protocols.md
  context-memory-subsystem-design.md
  operations-infrastructure-minimum-design.md
  protocol-facade-subsystem-design.md
  run-scheduling-runtime-subsystem-design.md
  session-flow-engine-resource-subsystem-design.md
  technical-approval-subsystem-design.md
  tool-call-subsystem-design.md
  agent-kernel-system-sfmea-test-plan.md
  agent-kernel-v2-architecture-review.md
]

active_markdown = Dir.glob(docs_root.join("**/*.md")).reject { |path| path.include?("/governance/archive/") }
active_markdown.each do |path|
  text = File.read(path)
  deprecated_names.each do |name|
    old_links = text.scan(/\]\(([^)]*#{Regexp.escape(name)}(?:#[^)]*)?)\)/).flatten
    invalid_links = old_links.reject { |link| link.include?("governance/archive/design-v3-pre-layering/") }
    abort("错误：活动文档仍把旧混合文档作为规范来源 #{name}：#{path}") unless invalid_links.empty?
  end

  text.scan(/\[[^\]]*\]\(([^)]+)\)/).flatten.each do |link|
    next if link.match?(/\A(?:https?:|mailto:|#)/)
    target_text = link.split("#", 2).first
    next if target_text.empty?
    target = Pathname.new(File.expand_path(target_text.gsub("%20", " "), File.dirname(path)))
    abort("错误：失效 Markdown 本地链接 #{link}：#{path}") unless target.exist?
  end
end

design_root = docs_root.join("design")
deprecated_names.each do |name|
  abort("错误：旧混合文档仍位于活动 design 根目录：#{name}") if design_root.join(name).exist?
end

diagram_text = Dir.glob(design_root.join("diagrams/**/*.puml")).map { |path| File.read(path) }.join("\n")
abort("错误：图中仍允许 L2 直接调用 L3。") if diagram_text.match?(/L2[^\n]*(?:-->|-right->|-down->)[^\n]*L3/)
abort("错误：图中仍把 User Token 直接传入 Kernel。") if diagram_text.include?("携带租户 / User Token")
abort("错误：图中仍把 RBAC/ABAC 权威库放在 Kernel 内。") if diagram_text.include?("权限规则库\\n(RBAC / ABAC)")

puts "三级文档架构检查通过：7 个层、#{layers.sum { |layer| layer.fetch('components').length }} 个组件、#{expected.length} 份受治理文档。"
