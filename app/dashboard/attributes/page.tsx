import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttributeDialog } from "@/app/dashboard/attributes/attribute-dialog";
import { DeleteAttributeButton } from "@/app/dashboard/attributes/delete-attribute-button";
import { AttributeValueEditDialog } from "@/app/dashboard/attributes/attribute-value-edit-dialog";
import type { Attribute, AttributeValue } from "@/lib/types";

export default async function AttributesPage() {
  const store = await getCurrentStore();
  const { data: attributes } = await supabaseAdmin
    .from("attributes")
    .select("*")
    .eq("store_id", store.id)
    .order("name");

  const attrList = (attributes ?? []) as Attribute[];
  const attributeIds = attrList.map((a) => a.id);

  const { data: values } = attributeIds.length
    ? await supabaseAdmin
        .from("attribute_values")
        .select("*")
        .in("attribute_id", attributeIds)
    : { data: [] as AttributeValue[] };

  const valuesByAttribute = new Map<string, AttributeValue[]>();
  (values ?? []).forEach((v) => {
    const list = valuesByAttribute.get(v.attribute_id) ?? [];
    list.push(v as AttributeValue);
    valuesByAttribute.set(v.attribute_id, list);
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Attributes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define custom product attributes like size, material, or color
          </p>
        </div>
        <div className="shrink-0">
          <AttributeDialog />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Values</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attrList.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No attributes yet.
                </TableCell>
              </TableRow>
            )}
            {attrList.map((attr) => (
              <TableRow key={attr.id}>
                <TableCell className="font-medium">{attr.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {(valuesByAttribute.get(attr.id) ?? []).map((av) => (
                      <div key={av.id} className="flex items-center gap-0.5">
                        <Badge variant="secondary" className={av.image_url ? "border-primary/30" : ""}>
                          {av.label ?? av.value}
                        </Badge>
                        <AttributeValueEditDialog
                          attributeValue={av}
                          attributeName={attr.name}
                          storeSourceLocale={store.google_content_language}
                        />
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <AttributeDialog attribute={attr} />
                    <DeleteAttributeButton attributeId={attr.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
